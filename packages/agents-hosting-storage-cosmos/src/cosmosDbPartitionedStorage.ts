// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Container, CosmosClient } from '@azure/cosmos'
import { escapeKey } from './cosmosDbKeyEscape'
import { DocumentStoreItem } from './documentStoreItem'
import { CosmosDbPartitionedStorageOptions } from './cosmosDbPartitionedStorageOptions'
import { Storage, StoreItems } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'
import { trace, redactString } from '@microsoft/agents-telemetry'
import { CosmosStorageTraceDefinitions } from './observability'
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:cosmos-storage')
const maxCachedInitializations = 100

interface CachedTask<T> {
  promise: Promise<T>;
  settled: boolean;
}

/**
 * A utility class to ensure that a specific asynchronous task is executed only once for a given key.
 * @typeParam T The type of the result returned by the asynchronous task.
 */
class DoOnce<T> {
  private readonly tasks = new Map<string, CachedTask<T>>()

  constructor (private readonly maxTasks: number) {}

  /**
   * Waits for the task associated with the given key to complete, or starts the task if it hasn't been started yet.
   * @param key The unique key identifying the task.
   * @param fn A function that returns a promise representing the task to execute.
   * @returns A promise that resolves to the result of the task.
   */
  waitFor (key: string, fn: () => Promise<T>): Promise<T> {
    const existingTask = this.tasks.get(key)
    if (existingTask) {
      this.tasks.delete(key)
      this.tasks.set(key, existingTask)
      return existingTask.promise
    }

    const cachedTask: CachedTask<T> = {
      promise: Promise.resolve().then(fn),
      settled: false,
    }
    this.tasks.set(key, cachedTask)
    cachedTask.promise.then(() => {
      if (this.tasks.get(key) === cachedTask) {
        cachedTask.settled = true
        this.evictLeastRecentlyUsed()
      }
    }, () => {
      if (this.tasks.get(key) === cachedTask) {
        this.tasks.delete(key)
      }
    })
    this.evictLeastRecentlyUsed()

    return cachedTask.promise
  }

  private evictLeastRecentlyUsed (): void {
    while (this.tasks.size > this.maxTasks) {
      let evicted = false
      for (const [key, task] of this.tasks) {
        if (task.settled) {
          this.tasks.delete(key)
          evicted = true
          break
        }
      }
      if (!evicted) {
        return
      }
    }
  }
}

interface ContainerInitialization {
  container: Container;
  compatibilityModePartitionKey: boolean;
}

const _doOnce: DoOnce<ContainerInitialization> = new DoOnce<ContainerInitialization>(maxCachedInitializations)

const maxDepthAllowed = 127

function isNotFoundError (err: unknown): boolean {
  if (!err || typeof err !== 'object' || !('code' in err)) {
    return false
  }

  return Number(err.code) === 404
}

/**
 * Implements storage using Cosmos DB partitioned storage.
 */
export class CosmosDbPartitionedStorage implements Storage {
  private container!: Container
  private client!: CosmosClient
  private compatibilityModePartitionKey = false;
  [key: string]: any;

  /**
   * The number of items in the storage. This property is not currently used.
   */
  length: number = 0

  /**
   * Initializes a new instance of the CosmosDbPartitionedStorage class.
   * @param cosmosDbStorageOptions The options for configuring Cosmos DB partitioned storage.
   */
  constructor (private readonly cosmosDbStorageOptions: CosmosDbPartitionedStorageOptions) {
    if (!cosmosDbStorageOptions) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingCosmosDbStorageOptions
      )
    }
    const { cosmosClientOptions } = cosmosDbStorageOptions
    if (!cosmosClientOptions?.endpoint) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingCosmosEndpoint
      )
    }
    if (!cosmosClientOptions?.key && !cosmosClientOptions?.tokenProvider) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingCosmosCredentials
      )
    }
    if (!cosmosDbStorageOptions.databaseId) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingDatabaseId
      )
    }
    if (!cosmosDbStorageOptions.containerId) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingContainerId
      )
    }
    cosmosDbStorageOptions.compatibilityMode ??= true
    if (cosmosDbStorageOptions.keySuffix) {
      if (cosmosDbStorageOptions.compatibilityMode) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          Errors.InvalidCompatibilityModeWithKeySuffix
        )
      }
      const suffixEscaped = escapeKey(cosmosDbStorageOptions.keySuffix)
      if (cosmosDbStorageOptions.keySuffix !== suffixEscaped) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          Errors.InvalidKeySuffixCharacters,
          undefined,
          { keySuffix: cosmosDbStorageOptions.keySuffix }
        )
      }
    }

    logger.info('CosmosDbPartitionedStorage settings loaded', {
      container: {
        id: redactString(cosmosDbStorageOptions.containerId, true),
        databaseId: redactString(cosmosDbStorageOptions.databaseId, true),
        throughput: cosmosDbStorageOptions.containerThroughput,
      },
      connection: {
        mode: cosmosClientOptions.tokenProvider !== undefined ? 'tokenProvider' : 'connectionString',
        endpoint: redactString(cosmosClientOptions.endpoint),
      },
      partitioning: {
        compatibilityMode: cosmosDbStorageOptions.compatibilityMode,
        keySuffix: cosmosDbStorageOptions.keySuffix,
      },
    })
  }

  /**
   * Reads items from storage.
   * @param keys The keys of the items to read.
   * @returns A promise that resolves to the read items.
   */
  async read (keys: string[]): Promise<StoreItems> {
    return trace(CosmosStorageTraceDefinitions.read, async ({ record }) => {
      if (!keys) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          Errors.MissingReadKeys
        )
      } else if (keys.length === 0) {
        return {}
      }

      record({ keyCount: keys?.length })
      await this.initialize()

      const storeItems: StoreItems = {}

      await Promise.all(
        keys.map(async (k: string): Promise<void> => {
          try {
            const escapedKey = escapeKey(
              k,
              this.cosmosDbStorageOptions.keySuffix,
              this.cosmosDbStorageOptions.compatibilityMode
            )

            const readItemResponse = await this.container
              .item(escapedKey, this.getPartitionKey(escapedKey))
              .read<DocumentStoreItem>()
            const documentStoreItem = readItemResponse.resource
            if (documentStoreItem) {
              storeItems[documentStoreItem.realId] = documentStoreItem.document
              storeItems[documentStoreItem.realId].eTag = documentStoreItem._etag
            }
          } catch (err: any) {
            if (err.code === 404) {
              // Not Found is not an error during read operations, just skip
            } else if (err.code === 400) {
              throw ExceptionHelper.generateException(
                Error,
                Errors.ContainerReadBadRequest,
                err
              )
            } else {
              throw ExceptionHelper.generateException(
                Error,
                Errors.ContainerReadError,
                err
              )
            }
          }
        })
      )

      return storeItems
    })
  }

  /**
   * Writes items to storage.
   * @param changes The items to write.
   */
  async write (changes: StoreItems): Promise<void> {
    return trace(CosmosStorageTraceDefinitions.write, async ({ record }) => {
      if (!changes) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          Errors.MissingWriteChanges
        )
      } else if (changes.length === 0) {
        return
      }

      record({ keyCount: Object.keys(changes).length })

      await this.initialize()

      await Promise.all(
        Object.entries(changes).map(async ([key, { eTag, ...change }]): Promise<void> => {
          const document = new DocumentStoreItem({
            id: escapeKey(
              key,
              this.cosmosDbStorageOptions.keySuffix,
              this.cosmosDbStorageOptions.compatibilityMode
            ),
            realId: key,
            document: change,
          })

          const accessCondition =
                      eTag !== '*' && eTag != null && eTag.length > 0
                        ? { accessCondition: { type: 'IfMatch', condition: eTag } }
                        : undefined

          try {
            await this.container.items.upsert(document, accessCondition)
          } catch (err: any) {
            this.checkForNestingError(change, err)
            throw ExceptionHelper.generateException(
              Error,
              Errors.DocumentUpsertError,
              err
            )
          }
        })
      )
    })
  }

  /**
   * Deletes items from storage.
   * @param keys The keys of the items to delete.
   */
  async delete (keys: string[]): Promise<void> {
    return trace(CosmosStorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      await this.initialize()

      await Promise.all(
        keys.map(async (k: string): Promise<void> => {
          const escapedKey = escapeKey(
            k,
            this.cosmosDbStorageOptions.keySuffix,
            this.cosmosDbStorageOptions.compatibilityMode
          )
          try {
            await this.container.item(escapedKey, this.getPartitionKey(escapedKey)).delete()
          } catch (err: any) {
            if (err.code === 404) {
              // Not Found is not an error during delete operations, just skip
            } else {
              throw ExceptionHelper.generateException(
                Error,
                Errors.DocumentDeleteError,
                err
              )
            }
          }
        })
      )
    })
  }

  /**
   * Initializes the Cosmos DB container.
   */
  private async initialize (): Promise<void> {
    if (!this.container) {
      const dbAndContainerKey = JSON.stringify([
        this.cosmosDbStorageOptions.cosmosClientOptions!.endpoint,
        this.cosmosDbStorageOptions.databaseId,
        this.cosmosDbStorageOptions.containerId,
      ])
      const initialization = await _doOnce.waitFor(
        dbAndContainerKey,
        () => {
          if (!this.client) {
            this.client = new CosmosClient(this.cosmosDbStorageOptions.cosmosClientOptions!)
          }
          return this.getOrCreateContainer()
        }
      )
      this.container = initialization.container
      this.compatibilityModePartitionKey = initialization.compatibilityModePartitionKey
    }
  }

  private async getOrCreateContainer (): Promise<ContainerInitialization> {
    let createIfNotExists = !this.cosmosDbStorageOptions.compatibilityMode
    let container: Container | undefined
    let compatibilityModePartitionKey = false

    try {
      const { database } = await this.client.databases.createIfNotExists({
        id: this.cosmosDbStorageOptions.databaseId
      })

      if (this.cosmosDbStorageOptions.compatibilityMode) {
        try {
          container = database.container(this.cosmosDbStorageOptions.containerId)
          const containerResponse = await container.read()
          const paths = containerResponse.resource?.partitionKey?.paths
          if (paths) {
            if (paths.includes('/_partitionKey')) {
              compatibilityModePartitionKey = true
            } else if (paths.indexOf(DocumentStoreItem.partitionKeyPath) === -1) {
              throw ExceptionHelper.generateException(
                Error,
                Errors.UnsupportedCustomPartitionKeyPath,
                undefined,
                {
                  containerId: this.cosmosDbStorageOptions.containerId,
                  partitionKeyPath: paths[0]
                }
              )
            }
          } else {
            compatibilityModePartitionKey = true
          }
          return { container, compatibilityModePartitionKey }
        } catch (err: unknown) {
          if (!isNotFoundError(err)) {
            throw err
          }
          createIfNotExists = true
        }
      }

      if (createIfNotExists) {
        const result = await database.containers.createIfNotExists({
          id: this.cosmosDbStorageOptions.containerId,
          partitionKey: {
            paths: [DocumentStoreItem.partitionKeyPath],
          },
          throughput: this.cosmosDbStorageOptions.containerThroughput,
        })
        return { container: result.container, compatibilityModePartitionKey }
      }

      if (!container) {
        throw ExceptionHelper.generateException(
          Error,
          Errors.ContainerNotFound,
          undefined,
          { containerId: this.cosmosDbStorageOptions.containerId }
        )
      }
      return { container, compatibilityModePartitionKey }
    } catch (err: any) {
      throw ExceptionHelper.generateException(
        Error,
        Errors.InitializationError,
        err,
        {
          databaseId: this.cosmosDbStorageOptions.databaseId,
          containerId: this.cosmosDbStorageOptions.containerId
        }
      )
    }
  }

  private getPartitionKey (key: string) {
    return this.compatibilityModePartitionKey ? undefined : key
  }

  private checkForNestingError (json: object, err: Error | Record<'message', string> | string): void {
    const ancestors = new WeakSet<object>()

    const checkDepth = (obj: unknown, depth: number, isInDialogState: boolean): void => {
      if (depth > maxDepthAllowed) {
        let additionalMessage = ''

        if (isInDialogState) {
          additionalMessage =
                        ' This is most likely caused by recursive component dialogs. ' +
                        'Try reworking your dialog code to make sure it does not keep dialogs on the stack ' +
                        "that it's not using. For example, consider using replaceDialog instead of beginDialog."
        } else {
          additionalMessage = ' Please check your data for signs of unintended recursion.'
        }

        // Convert err to Error if needed
        const errorObj = typeof err === 'string'
          ? new Error(err)
          : err instanceof Error
            ? err
            : new Error(err.message)

        throw ExceptionHelper.generateException(
          Error,
          Errors.MaxNestingDepthExceeded,
          errorObj,
          {
            maxDepth: maxDepthAllowed.toString(),
            additionalMessage
          }
        )
      } else if (obj && typeof obj === 'object') {
        if (ancestors.has(obj)) {
          return
        }

        ancestors.add(obj)
        try {
          for (const [key, value] of Object.entries(obj)) {
            checkDepth(value, depth + 1, key === 'dialogStack' || isInDialogState)
          }
        } finally {
          ancestors.delete(obj)
        }
      }
    }

    checkDepth(json, 0, false)
  }
}
