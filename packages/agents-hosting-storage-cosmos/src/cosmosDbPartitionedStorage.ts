// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Container, CosmosClient } from '@azure/cosmos'
import { CosmosDbKeyEscape } from './cosmosDbKeyEscape'
import { DocumentStoreItem } from './documentStoreItem'
import { CosmosDbPartitionedStorageOptions } from './cosmosDbPartitionedStorageOptions'
import { Storage, StoreItems } from '@microsoft/agents-hosting'
import { ErrorHelper, ExceptionHelper } from './errorHelper'

/**
 * A utility class to ensure that a specific asynchronous task is executed only once for a given key.
 * @typeParam T The type of the result returned by the asynchronous task.
 */
export class DoOnce<T> {
  private task: {
    [key: string]: Promise<T>;
  } = {}

  /**
   * Waits for the task associated with the given key to complete, or starts the task if it hasn't been started yet.
   * @param key The unique key identifying the task.
   * @param fn A function that returns a promise representing the task to execute.
   * @returns A promise that resolves to the result of the task.
   */
  waitFor (key: string, fn: () => Promise<T>): Promise<T> {
    if (!this.task[key]) {
      this.task[key] = fn()
    }

    return this.task[key]
  }
}

const _doOnce: DoOnce<Container> = new DoOnce<Container>()

const maxDepthAllowed = 127

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
        ErrorHelper.MissingCosmosDbStorageOptions
      )
    }
    const { cosmosClientOptions } = cosmosDbStorageOptions
    if (!cosmosClientOptions?.endpoint) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingCosmosEndpoint
      )
    }
    if (!cosmosClientOptions?.key && !cosmosClientOptions?.tokenProvider) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingCosmosCredentials
      )
    }
    if (!cosmosDbStorageOptions.databaseId) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingDatabaseId
      )
    }
    if (!cosmosDbStorageOptions.containerId) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingContainerId
      )
    }
    cosmosDbStorageOptions.compatibilityMode ??= true
    if (cosmosDbStorageOptions.keySuffix) {
      if (cosmosDbStorageOptions.compatibilityMode) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          ErrorHelper.InvalidCompatibilityModeWithKeySuffix
        )
      }
      const suffixEscaped = CosmosDbKeyEscape.escapeKey(cosmosDbStorageOptions.keySuffix)
      if (cosmosDbStorageOptions.keySuffix !== suffixEscaped) {
        throw ExceptionHelper.generateException(
          ReferenceError,
          ErrorHelper.InvalidKeySuffixCharacters,
          undefined,
          cosmosDbStorageOptions.keySuffix
        )
      }
    }
  }

  /**
   * Reads items from storage.
   * @param keys The keys of the items to read.
   * @returns A promise that resolves to the read items.
   */
  async read (keys: string[]): Promise<StoreItems> {
    if (!keys) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingReadKeys
      )
    } else if (keys.length === 0) {
      return {}
    }

    await this.initialize()

    const storeItems: StoreItems = {}

    await Promise.all(
      keys.map(async (k: string): Promise<void> => {
        try {
          const escapedKey = CosmosDbKeyEscape.escapeKey(
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
              ErrorHelper.ContainerReadBadRequest,
              err
            )
          } else {
            throw ExceptionHelper.generateException(
              Error,
              ErrorHelper.ContainerReadError,
              err
            )
          }
        }
      })
    )

    return storeItems
  }

  /**
   * Writes items to storage.
   * @param changes The items to write.
   */
  async write (changes: StoreItems): Promise<void> {
    if (!changes) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        ErrorHelper.MissingWriteChanges
      )
    } else if (changes.length === 0) {
      return
    }

    await this.initialize()

    await Promise.all(
      Object.entries(changes).map(async ([key, { eTag, ...change }]): Promise<void> => {
        const document = new DocumentStoreItem({
          id: CosmosDbKeyEscape.escapeKey(
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
            ErrorHelper.DocumentUpsertError,
            err
          )
        }
      })
    )
  }

  /**
   * Deletes items from storage.
   * @param keys The keys of the items to delete.
   */
  async delete (keys: string[]): Promise<void> {
    await this.initialize()

    await Promise.all(
      keys.map(async (k: string): Promise<void> => {
        const escapedKey = CosmosDbKeyEscape.escapeKey(
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
              ErrorHelper.DocumentDeleteError,
              err
            )
          }
        }
      })
    )
  }

  /**
   * Initializes the Cosmos DB container.
   */
  private async initialize (): Promise<void> {
    if (!this.container) {
      if (!this.client) {
        this.client = new CosmosClient(this.cosmosDbStorageOptions.cosmosClientOptions!)
      }
      const dbAndContainerKey = `${this.cosmosDbStorageOptions.databaseId}-${this.cosmosDbStorageOptions.containerId}`
      this.container = await _doOnce.waitFor(
        dbAndContainerKey,
        async (): Promise<Container> => await this.getOrCreateContainer()
      )
    }
  }

  private async getOrCreateContainer (): Promise<Container> {
    let createIfNotExists = !this.cosmosDbStorageOptions.compatibilityMode
    let container: Container | undefined

    try {
      const { database } = await this.client.databases.createIfNotExists({
        id: this.cosmosDbStorageOptions.databaseId
      })

      if (this.cosmosDbStorageOptions.compatibilityMode) {
        try {
          container = database.container(this.cosmosDbStorageOptions.containerId)
          // @ts-ignore
          const partitionKeyResponse = await container.readPartitionKeyDefinition()
          if (partitionKeyResponse.resource && partitionKeyResponse.resource.paths) {
            const paths = partitionKeyResponse.resource.paths
            if (paths.includes('/_partitionKey')) {
              this.compatibilityModePartitionKey = true
            } else if (paths.indexOf(DocumentStoreItem.partitionKeyPath) === -1) {
              throw ExceptionHelper.generateException(
                Error,
                ErrorHelper.UnsupportedCustomPartitionKeyPath,
                undefined,
                this.cosmosDbStorageOptions.containerId,
                paths[0]
              )
            }
          } else {
            this.compatibilityModePartitionKey = true
          }
          return container
        } catch {
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
        return result.container
      }

      if (!container) {
        throw ExceptionHelper.generateException(
          Error,
          ErrorHelper.ContainerNotFound,
          undefined,
          this.cosmosDbStorageOptions.containerId
        )
      }
      return container
    } catch (err: any) {
      throw ExceptionHelper.generateException(
        Error,
        ErrorHelper.InitializationError,
        err,
        this.cosmosDbStorageOptions.databaseId,
        this.cosmosDbStorageOptions.containerId
      )
    }
  }

  private getPartitionKey (key: string) {
    return this.compatibilityModePartitionKey ? undefined : key
  }

  private checkForNestingError (json: object, err: Error | Record<'message', string> | string): void {
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
          ErrorHelper.MaxNestingDepthExceeded,
          errorObj,
          maxDepthAllowed.toString(),
          additionalMessage
        )
      } else if (obj && typeof obj === 'object') {
        for (const [key, value] of Object.entries(obj)) {
          checkDepth(value, depth + 1, key === 'dialogStack' || isInDialogState)
        }
      }
    }

    checkDepth(json, 0, false)
  }
}
