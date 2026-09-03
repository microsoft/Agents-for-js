// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Container, CosmosClient } from '@azure/cosmos'
import { escapeKey } from './cosmosDbKeyEscape'
import { DocumentStoreItem } from './documentStoreItem'
import {
  CosmosDbPartitionedStorageOptions,
  VersionedCosmosDbPartitionedStorageOptions,
} from './cosmosDbPartitionedStorageOptions'
import {
  StorageDeleteArguments,
  StorageDeleteOptions,
  StorageDeleteResults,
  StorageDeleteReturn,
  StorageOperationStatus,
  StorageReadResults,
  StorageReadReturn,
  StorageVersion,
  StorageVersionOptions,
  StorageVersions,
  StorageWriteArguments,
  StorageWriteChanges,
  StorageWriteMode,
  StorageWriteOptions,
  StorageWriteResults,
  StorageWriteReturn,
  StoreItems,
  VersionedStorage,
} from '@microsoft/agents-hosting'
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
 * Cosmos DB partitioned storage provider. The legacy contract is the default;
 * set `storageVersion: 2` in the options to select StorageV2.
 */
export class CosmosDbPartitionedStorage<V extends StorageVersion = typeof StorageVersions.V1> implements VersionedStorage<V> {
  readonly storageVersion: V
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
   *
   * @remarks
   * Direct object literals infer the selected contract. For options stored in a variable, preserve
   * `storageVersion` as a literal with `as const`, `satisfies`, or an explicit versioned options type.
   */
  constructor (cosmosDbStorageOptions: VersionedCosmosDbPartitionedStorageOptions<V>)
  constructor (cosmosDbStorageOptions: CosmosDbPartitionedStorageOptions)
  constructor (
    private readonly cosmosDbStorageOptions:
    CosmosDbPartitionedStorageOptions | VersionedCosmosDbPartitionedStorageOptions<V>
  ) {
    if (!cosmosDbStorageOptions) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingCosmosDbStorageOptions
      )
    }
    const storageVersion = (cosmosDbStorageOptions as Partial<StorageVersionOptions<V>>).storageVersion ?? StorageVersions.V1
    if (!Object.values(StorageVersions).some(version => version === storageVersion)) {
      throw ExceptionHelper.generateException(RangeError, Errors.UnsupportedStorageVersion, undefined, { storageVersion: String(storageVersion) })
    }
    this.storageVersion = storageVersion as V

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
   * Reads items from Cosmos DB storage.
   *
   * @param keys The keys to read
   * @returns Legacy items for V1, or one keyed operation result per requested key for V2
   * @throws When the key input is invalid or Cosmos DB cannot complete the operation
   */
  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadReturn<V, T>> {
    return trace(CosmosStorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (this.storageVersion === StorageVersions.V2) {
        return await this.readV2<T>(keys) as StorageReadReturn<V, T>
      }
      return await this.readV1(keys) as StorageReadReturn<V, T>
    })
  }

  /**
   * Writes items to Cosmos DB storage.
   *
   * @param changes The keyed items to write
   * @param args V2 write options; unavailable for V1
   * @returns Nothing for V1, or one keyed operation result per change for V2
   * @throws When the input is invalid or Cosmos DB cannot complete the operation
   */
  async write<T extends object = Record<string, unknown>> (
    changes: StorageWriteChanges<V, T>,
    ...args: StorageWriteArguments<V>
  ): Promise<StorageWriteReturn<V>> {
    return trace(CosmosStorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : undefined })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageWriteOptions?]
        return await this.writeV2(changes as Record<string, T>, options) as StorageWriteReturn<V>
      }
      await this.writeV1(changes as StoreItems)
      return undefined as StorageWriteReturn<V>
    })
  }

  /**
   * Deletes items from Cosmos DB storage.
   *
   * @param keys The keys to delete
   * @param args V2 delete options; unavailable for V1
   * @returns Nothing for V1, or one keyed operation result per requested key for V2
   * @throws When the key input is invalid or Cosmos DB cannot complete the operation
   */
  async delete (keys: string[], ...args: StorageDeleteArguments<V>): Promise<StorageDeleteReturn<V>> {
    return trace(CosmosStorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageDeleteOptions?]
        return await this.deleteV2(keys, options) as StorageDeleteReturn<V>
      }
      await this.deleteV1(keys)
      return undefined as StorageDeleteReturn<V>
    })
  }

  /**
   * Reads legacy items and attaches Cosmos DB ETags as `eTag` values.
   *
   * @param keys The keys to read
   * @returns The stored items; missing keys are omitted
   * @throws When the key input is invalid or Cosmos DB cannot complete the operation
   */
  private async readV1 (keys: string[]): Promise<StoreItems> {
    if (!keys) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.MissingReadKeys)
    } else if (keys.length === 0) {
      return {}
    }

    await this.initialize()
    const storeItems: StoreItems = {}

    await Promise.all(keys.map(async (key: string): Promise<void> => {
      try {
        const escapedKey = escapeKey(
          key,
          this.cosmosDbStorageOptions.keySuffix,
          this.cosmosDbStorageOptions.compatibilityMode
        )
        const response = await this.container
          .item(escapedKey, this.getPartitionKey(escapedKey))
          .read<DocumentStoreItem>()
        const item = response.resource
        if (item) {
          storeItems[item.realId] = item.document
          storeItems[item.realId].eTag = item._etag
        }
      } catch (err: any) {
        if (err.code === 404) return
        if (err.code === 400) {
          throw ExceptionHelper.generateException(Error, Errors.ContainerReadBadRequest, err)
        }
        throw ExceptionHelper.generateException(Error, Errors.ContainerReadError, err)
      }
    }))

    return storeItems
  }

  /**
   * Reads V2 items with one status and Cosmos DB ETag version per requested key.
   *
   * @param keys The keys to read
   * @returns The keyed V2 read results
   * @throws When the key input is invalid or Cosmos DB cannot complete the operation
   */
  private async readV2<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    validateV2Keys(keys)
    if (keys.length === 0) return {}

    await this.initialize()

    const results: StorageReadResults<T> = {}

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
            const version = (documentStoreItem as DocumentStoreItem & { _etag?: string })._etag
            const value = documentStoreItem.document as T
            results[k] = {
              key: k,
              status: StorageOperationStatus.Succeeded,
              value,
              version,
            }
          } else {
            results[k] = { key: k, status: StorageOperationStatus.NotFound }
          }
        } catch (err: any) {
          if (err.code === 404) {
            results[k] = { key: k, status: StorageOperationStatus.NotFound }
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

    return results
  }

  /**
   * Writes legacy items and applies `eTag` concurrency checks.
   *
   * @param changes The keyed legacy items to write
   * @throws When the input is invalid or Cosmos DB cannot complete the operation
   */
  private async writeV1 (changes: StoreItems): Promise<void> {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw ExceptionHelper.generateException(ReferenceError, Errors.MissingWriteChanges)
    }
    if (Object.keys(changes).length === 0) {
      return
    }

    await this.initialize()

    await Promise.all(Object.entries(changes).map(async ([key, { eTag, ...change }]): Promise<void> => {
      const document = new DocumentStoreItem({
        id: escapeKey(
          key,
          this.cosmosDbStorageOptions.keySuffix,
          this.cosmosDbStorageOptions.compatibilityMode
        ),
        realId: key,
        document: change,
      })
      const accessCondition = eTag !== '*' && eTag != null && eTag.length > 0
        ? { accessCondition: { type: 'IfMatch', condition: eTag } }
        : undefined

      try {
        await this.container.items.upsert(document, accessCondition)
      } catch (err: any) {
        this.checkForNestingError(change, err)
        throw ExceptionHelper.generateException(Error, Errors.DocumentUpsertError, err)
      }
    }))
  }

  /**
   * Writes V2 items with mode and expected-version conditions.
   *
   * @param changes The keyed values to write
   * @param options The V2 write mode and expected version
   * @returns One keyed operation result per change
   * @throws When the input is invalid or Cosmos DB cannot complete the operation
   */
  private async writeV2<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    validateExpectedVersion(options?.expectedVersion)
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      throw ExceptionHelper.generateException(
        ReferenceError,
        Errors.MissingWriteChanges
      )
    }
    const mode = options?.mode ?? StorageWriteMode.Upsert
    validateWriteMode(mode)
    if (Object.keys(changes).length === 0) return {}
    validateV2ChangeKeys(changes)
    if (Object.values(changes).some(value => value === null || typeof value !== 'object' || Array.isArray(value))) {
      throw ExceptionHelper.generateException(TypeError, Errors.StorageV2ValueRequired)
    }
    await this.initialize()

    const results: StorageWriteResults = {}
    await Promise.all(
      Object.entries(changes).map(async ([key, value]): Promise<void> => {
        const document = new DocumentStoreItem({
          id: escapeKey(
            key,
            this.cosmosDbStorageOptions.keySuffix,
            this.cosmosDbStorageOptions.compatibilityMode
          ),
          realId: key,
          document: value,
        })

        const expectedVersion = options?.expectedVersion
        const accessCondition = expectedVersion !== undefined
          ? { accessCondition: { type: 'IfMatch', condition: expectedVersion } }
          : undefined

        if (mode === StorageWriteMode.CreateOnly && expectedVersion !== undefined) {
          const item = this.container.item(document.id, this.getPartitionKey(document.id))
          try {
            const current = await item.read<DocumentStoreItem>()
            const currentVersion = (current.resource as DocumentStoreItem & { _etag?: string } | undefined)?._etag
            if (current.resource) {
              results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
              return
            }
            results[key] = { key, status: StorageOperationStatus.ConditionNotMet }
            return
          } catch (err: any) {
            if (err.code === 404) {
              results[key] = { key, status: StorageOperationStatus.ConditionNotMet }
              return
            }
            throw ExceptionHelper.generateException(Error, Errors.DocumentUpsertError, err)
          }
        }

        try {
          let response
          if (mode === StorageWriteMode.CreateOnly) {
            response = await this.container.items.create(document)
          } else if (mode === StorageWriteMode.Replace) {
            response = await this.container.item(document.id, this.getPartitionKey(document.id)).replace(document, accessCondition)
          } else if (expectedVersion !== undefined) {
            // Cosmos can ignore If-Match when an upsert creates a missing item.
            // Replace keeps the expected-version condition atomic and prevents creation.
            response = await this.container.item(document.id, this.getPartitionKey(document.id)).replace(document, accessCondition)
          } else {
            response = await this.container.items.upsert(document, accessCondition)
          }
          results[key] = { key, status: StorageOperationStatus.Succeeded, version: response?.etag }
        } catch (err: any) {
          if (mode === StorageWriteMode.CreateOnly && err.code === 409) {
            results[key] = { key, status: StorageOperationStatus.Conflict }
            return
          }
          if (err.code === 404) {
            results[key] = {
              key,
              status: mode === StorageWriteMode.Upsert && expectedVersion !== undefined
                ? StorageOperationStatus.ConditionNotMet
                : StorageOperationStatus.NotFound,
            }
            return
          }
          if (err.code === 412) {
            results[key] = { key, status: StorageOperationStatus.ConditionNotMet }
            return
          }
          this.checkForNestingError(value as object, err)
          throw ExceptionHelper.generateException(
            Error,
            Errors.DocumentUpsertError,
            err
          )
        }
      })
    )
    return results
  }

  /**
   * Deletes legacy items and ignores missing documents.
   *
   * @param keys The keys to delete
   * @throws When Cosmos DB cannot complete the operation
   */
  private async deleteV1 (keys: string[]): Promise<void> {
    await this.initialize()

    await Promise.all(keys.map(async (key: string): Promise<void> => {
      const escapedKey = escapeKey(
        key,
        this.cosmosDbStorageOptions.keySuffix,
        this.cosmosDbStorageOptions.compatibilityMode
      )
      try {
        await this.container.item(escapedKey, this.getPartitionKey(escapedKey)).delete()
      } catch (err: any) {
        if (err.code !== 404) {
          throw ExceptionHelper.generateException(Error, Errors.DocumentDeleteError, err)
        }
      }
    }))
  }

  /**
   * Deletes V2 items with an optional expected-version condition.
   *
   * @param keys The keys to delete
   * @param options The optional expected version
   * @returns One keyed operation result per requested key
   * @throws When the key input is invalid or Cosmos DB cannot complete the operation
   */
  private async deleteV2 (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    validateExpectedVersion(options?.expectedVersion)
    validateV2Keys(keys)
    if (keys.length === 0) return {}
    await this.initialize()

    const results: StorageDeleteResults = {}
    await Promise.all(
      keys.map(async (k: string): Promise<void> => {
        const escapedKey = escapeKey(
          k,
          this.cosmosDbStorageOptions.keySuffix,
          this.cosmosDbStorageOptions.compatibilityMode
        )
        try {
          const item = this.container.item(escapedKey, this.getPartitionKey(escapedKey))
          if (options?.expectedVersion === undefined) {
            await item.delete()
            results[k] = { key: k, status: StorageOperationStatus.Succeeded }
            return
          }
          const current = await item.read<DocumentStoreItem>()
          const document = current.resource
          if (!document) {
            results[k] = { key: k, status: StorageOperationStatus.NotFound }
            return
          }
          const version = (document as DocumentStoreItem & { _etag?: string })._etag
          if (options.expectedVersion !== version) {
            results[k] = { key: k, status: StorageOperationStatus.ConditionNotMet, version }
            return
          }
          const deleteOptions = { accessCondition: { type: 'IfMatch', condition: options.expectedVersion } }
          await item.delete(deleteOptions)
          results[k] = { key: k, status: StorageOperationStatus.Succeeded, version }
        } catch (err: any) {
          if (err.code === 404) {
            results[k] = { key: k, status: StorageOperationStatus.NotFound }
          } else if (err.code === 412) {
            results[k] = { key: k, status: StorageOperationStatus.ConditionNotMet }
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
    return results
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

function validateV2Keys (keys: string[]): void {
  if (!Array.isArray(keys) || keys.some(key => typeof key !== 'string' || key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.MissingReadKeys)
  }
}

function validateV2ChangeKeys (changes: Record<string, unknown>): void {
  if (Object.keys(changes).some(key => key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function validateExpectedVersion (expectedVersion: string | undefined): void {
  if (expectedVersion === '') {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
  }
}

function validateWriteMode (mode: StorageWriteMode): void {
  if (!Object.values(StorageWriteMode).includes(mode)) {
    throw ExceptionHelper.generateException(RangeError, Errors.StorageV2WriteModeUnsupported, undefined, { mode: String(mode) })
  }
}
