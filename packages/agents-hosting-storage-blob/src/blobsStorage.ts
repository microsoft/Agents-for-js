import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import { isTokenCredential, TokenCredential } from '@azure/core-auth'
import {
  AnonymousCredential,
  ContainerClient,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
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
import { sanitizeBlobKey } from './blobsTranscriptStore'
import { ignoreError, isStatusCodeError } from './ignoreError'
import { trace, debug } from '@microsoft/agents-telemetry'
import { BlobsStorageTraceDefinitions } from './observability'

const logger = debug('agents:blob-storage')

/**
 * Options for configuring the BlobsStorage.
 */
export interface BlobsStorageOptions {
  /**
   * Optional Azure Storage pipeline options to customize request behavior
   */
  storagePipelineOptions?: StoragePipelineOptions;
}

/**
 * Options that select the Blob storage contract at construction time.
 *
 * @remarks Preserve `storageVersion` as a literal in variable options to keep version-specific
 * return types. Use `as const`, `satisfies`, or an explicit versioned options type.
 */
export type VersionedBlobsStorageOptions<V extends StorageVersion> =
  BlobsStorageOptions & StorageVersionOptions<V>

/**
 * Azure Blob Storage provider. The legacy contract is the default; set
 * `storageVersion: 2` in `options` to select StorageV2.
 * Provides persistence for bot state data using Azure's Blob Storage service.
 */
export class BlobsStorage<V extends StorageVersion = typeof StorageVersions.V1> implements VersionedStorage<V> {
  readonly storageVersion: V
  private readonly _containerClient: ContainerClient
  private readonly _concurrency = Infinity
  private _initializePromise?: Promise<unknown>

  /**
   * Creates a new instance of the BlobsStorage class.
   *
   * @param containerName The name of the Blob container to use
   * @param connectionString Optional, The Azure Storage connection string
   * @param options Optional configuration settings for the storage provider
   * @param url Optional URL to the blob service (used instead of connectionString if provided)
   * @param credential Optional credential for authentication (used with url if provided)
   *
   * @remarks
   * Direct object literals infer the selected contract. For options stored in a variable, preserve
   * `storageVersion` as a literal with `as const`, `satisfies`, or an explicit versioned options type.
   */
  constructor (
    containerName: string,
    connectionString: string | undefined,
    options: VersionedBlobsStorageOptions<V>,
    url?: string,
    credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential
  )
  constructor (
    containerName: string,
    connectionString?: string,
    options?: BlobsStorageOptions,
    url?: string,
    credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential
  )
  constructor (
    containerName: string,
    connectionString?: string,
    options?: BlobsStorageOptions | VersionedBlobsStorageOptions<V>,
    url = '',
    credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential
  ) {
    const storageVersion = (options as Partial<StorageVersionOptions<V>> | undefined)?.storageVersion ?? StorageVersions.V1
    validateStorageVersion(storageVersion)
    this.storageVersion = storageVersion as V
    if (url.trim() !== '') {
      z.object({ url: z.string() }).parse({
        url,
      })

      this._containerClient = new ContainerClient(url, credential, options?.storagePipelineOptions)

      if (url.trim() === 'UseDevelopmentStorage=true;') {
        this._concurrency = 1
      }
    } else {
      z.object({ connectionString: z.string(), containerName: z.string() }).parse({
        connectionString,
        containerName,
      })

      this._containerClient = new ContainerClient(
        connectionString!,
        containerName,
        options?.storagePipelineOptions
      )

      if (connectionString!.trim() === 'UseDevelopmentStorage=true;') {
        this._concurrency = 1
      }
    }
    logger.info('BlobsStorage settings loaded', {
      container: containerName,
      connection: {
        mode: isTokenCredential(credential) ? 'tokenCredential' : url.trim() !== '' ? 'url' : 'connectionString',
        type: (url.trim() !== '' ? url : connectionString!).trim() === 'UseDevelopmentStorage=true;' ? 'development' : 'production',
      },
      pipeline: options?.storagePipelineOptions !== undefined ? 'custom' : 'default',
    })
  }

  private toJSON (): unknown {
    return { name: 'BlobsStorage' }
  }

  private _initialize (): Promise<unknown> {
    if (!this._initializePromise) {
      this._initializePromise = this._containerClient.createIfNotExists()
    }
    return this._initializePromise
  }

  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadReturn<V, T>> {
    return trace(BlobsStorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      if (this.storageVersion === StorageVersions.V2) {
        return await this.readV2<T>(keys) as StorageReadReturn<V, T>
      }
      return await this.readV1(keys) as StorageReadReturn<V, T>
    })
  }

  async write<T extends object = Record<string, unknown>> (
    changes: StorageWriteChanges<V, T>,
    ...args: StorageWriteArguments<V>
  ): Promise<StorageWriteReturn<V>> {
    return trace(BlobsStorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : 0 })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageWriteOptions?]
        return await this.writeV2(changes as Record<string, T>, options) as StorageWriteReturn<V>
      }
      await this.writeV1(changes as StoreItems)
      return undefined as StorageWriteReturn<V>
    })
  }

  async delete (keys: string[], ...args: StorageDeleteArguments<V>): Promise<StorageDeleteReturn<V>> {
    return trace(BlobsStorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      if (this.storageVersion === StorageVersions.V2) {
        const [options] = args as [StorageDeleteOptions?]
        return await this.deleteV2(keys, options) as StorageDeleteReturn<V>
      }
      await this.deleteV1(keys)
      return undefined as StorageDeleteReturn<V>
    })
  }

  /**
   * Reads storage items from blob storage.
   *
   * @param keys Array of item keys to read
   * @returns A promise that resolves to a StoreItems object containing the retrieved items
   * @throws Will throw if keys parameter is invalid or if there's an error reading from storage
   */
  private async readV1 (keys: string[]): Promise<StoreItems> {
    z.object({ keys: z.array(z.string()) }).parse({ keys })

    await this._initialize()

    const results = await Promise.all(keys.map(async key => {
      const result = { key, value: undefined as unknown }
      const blob = await ignoreError(
        this._containerClient.getBlobClient(sanitizeBlobKey(key)).download(),
        isStatusCodeError(404)
      )
      if (!blob?.readableStreamBody) return result

      const parsed = await StreamConsumers.json(blob.readableStreamBody) as Record<string, unknown>
      result.value = { ...parsed, eTag: blob.etag }
      logger.debug(`Read blob: ${key}, eTag: ${blob.etag}`)
      return result
    }))

    return results.reduce<StoreItems>((items, { key, value }) => (
      value ? { ...items, [key]: value } : items
    ), {})
  }

  private async readV2<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    validateV2Keys(keys)
    if (keys.length === 0) return {}

    await this._initialize()

    const results: StorageReadResults<T> = {}
    await Promise.all(keys.map(async (key) => {
      try {
        const { etag: version, readableStreamBody } = await this._containerClient.getBlobClient(sanitizeBlobKey(key)).download()
        if (!readableStreamBody) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          return
        }

        const value = await StreamConsumers.json(readableStreamBody) as T
        results[key] = { key, status: StorageOperationStatus.Succeeded, value, version }
        logger.debug(`Read blob: ${key}, eTag: ${version}`)
      } catch (err) {
        if (isStatusCodeError(404)(err as Error)) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          return
        }
        throwStorageOperationError('read', key, err)
      }
    }))

    return results
  }

  /**
   * Writes storage items to blob storage.
   *
   * @param changes The items to write to storage
   * @returns A promise that resolves when the write operation is complete
   * @throws Will throw if there's a validation error, eTag conflict, or other storage error
   */
  private async writeV1 (changes: StoreItems): Promise<void> {
    z.record(z.unknown()).parse(changes)

    await this._initialize()

    await Promise.all(Object.entries(changes).map(async ([key, { eTag = '', ...change }]) => {
      try {
        const blob = this._containerClient.getBlockBlobClient(sanitizeBlobKey(key))
        const serialized = JSON.stringify(change)
        logger.debug(`Writing blob: ${key}, eTag: ${eTag}, size: ${serialized.length}`)
        await blob.upload(serialized, serialized.length, {
          conditions: typeof eTag === 'string' && eTag !== '*' ? { ifMatch: eTag } : {},
          blobHTTPHeaders: { blobContentType: 'application/json' },
        })
      } catch (err: any) {
        if (err.statusCode === 412) {
          throw ExceptionHelper.generateException(Error, Errors.ETagConflict)
        }
        throw err
      }
    }))
  }

  private async writeV2<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    validateExpectedVersion(options?.expectedVersion)
    validateV2Changes(changes)
    const mode = options?.mode ?? StorageWriteMode.Upsert
    validateWriteMode(mode)
    if (Object.keys(changes).length === 0) return {}

    await this._initialize()

    const results: StorageWriteResults = {}
    await Promise.all(Object.entries(changes).map(async ([key, change]) => {
      const blob = this._containerClient.getBlockBlobClient(sanitizeBlobKey(key))
      const needsCurrentVersion = mode !== StorageWriteMode.Upsert || options?.expectedVersion !== undefined
      const currentVersion = needsCurrentVersion ? await this.getVersion(key) : undefined
      if (mode === StorageWriteMode.CreateOnly && currentVersion !== undefined) {
        results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
        return
      }
      if (mode === StorageWriteMode.Replace && currentVersion === undefined) {
        results[key] = { key, status: StorageOperationStatus.NotFound }
        return
      }
      if (options?.expectedVersion !== undefined && options.expectedVersion !== currentVersion) {
        results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
        return
      }

      const serialized = JSON.stringify(change)
      const conditions = mode === StorageWriteMode.CreateOnly
        ? { ifNoneMatch: '*' }
        : options?.expectedVersion !== undefined
          ? { ifMatch: options.expectedVersion }
          : mode === StorageWriteMode.Replace && currentVersion !== undefined
            ? { ifMatch: currentVersion }
            : undefined
      try {
        const response = await blob.upload(serialized, serialized.length, {
          conditions,
          blobHTTPHeaders: { blobContentType: 'application/json' },
        })
        results[key] = { key, status: StorageOperationStatus.Succeeded, version: response.etag }
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (mode === StorageWriteMode.CreateOnly && (statusCode === 409 || statusCode === 412)) {
          results[key] = { key, status: StorageOperationStatus.Conflict, version: currentVersion }
          return
        }
        if (statusCode === 412) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
          return
        }
        if (statusCode === 404) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          return
        }
        throwStorageOperationError('write', key, err)
      }
    }))
    return results
  }

  /**
   * Deletes storage items from blob storage.
   *
   * @param keys Array of item keys to delete
   * @returns A promise that resolves when the delete operation is complete
   * @throws Will throw if keys parameter is invalid
   */
  private async deleteV1 (keys: string[]): Promise<void> {
    z.object({ keys: z.array(z.string()) }).parse({ keys })

    await this._initialize()

    await Promise.all(keys.map(key => ignoreError(
      this._containerClient.deleteBlob(sanitizeBlobKey(key)),
      isStatusCodeError(404)
    )))
  }

  private async deleteV2 (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    validateExpectedVersion(options?.expectedVersion)
    validateV2Keys(keys)
    if (keys.length === 0) return {}

    await this._initialize()

    const results: StorageDeleteResults = {}
    await Promise.all(keys.map(async key => {
      let currentVersion: string | undefined
      if (options?.expectedVersion !== undefined) {
        currentVersion = await this.getVersion(key)
        if (currentVersion === undefined) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          return
        }
        if (options.expectedVersion !== currentVersion) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
          return
        }
      }
      try {
        await this._containerClient.deleteBlob(
          sanitizeBlobKey(key),
          options?.expectedVersion === undefined ? undefined : { conditions: { ifMatch: options.expectedVersion } }
        )
        results[key] = { key, status: StorageOperationStatus.Succeeded, version: currentVersion }
      } catch (err) {
        const statusCode = (err as { statusCode?: number }).statusCode
        if (statusCode === 412) {
          results[key] = { key, status: StorageOperationStatus.ConditionNotMet, version: currentVersion }
          return
        }
        if (statusCode === 404) {
          results[key] = { key, status: StorageOperationStatus.NotFound }
          return
        }
        throwStorageOperationError('delete', key, err)
      }
    }))
    return results
  }

  private async getVersion (key: string): Promise<string | undefined> {
    try {
      const properties = await this._containerClient.getBlobClient(sanitizeBlobKey(key)).getProperties()
      return properties.etag
    } catch (err) {
      if (isStatusCodeError(404)(err as Error)) return undefined
      throwStorageOperationError('read version', key, err)
    }
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

function validateV2Changes (changes: Record<string, unknown>): void {
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2ChangesRequired)
  }
  if (Object.keys(changes).some(key => key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
  if (Object.values(changes).some(value => value === null || typeof value !== 'object' || Array.isArray(value))) {
    throw ExceptionHelper.generateException(TypeError, Errors.StorageV2ValueRequired)
  }
}

function validateV2Keys (keys: string[]): void {
  if (!Array.isArray(keys)) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeysRequired)
  }
  if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function validateStorageVersion (storageVersion: number): asserts storageVersion is StorageVersion {
  if (!Object.values(StorageVersions).some(version => version === storageVersion)) {
    throw ExceptionHelper.generateException(RangeError, Errors.UnsupportedStorageVersion, undefined, { storageVersion: String(storageVersion) })
  }
}

function throwStorageOperationError (operation: string, key: string, error: unknown): never {
  throw ExceptionHelper.generateException(
    Error,
    Errors.StorageV2OperationFailed,
    error instanceof Error ? error : undefined,
    { operation, key }
  )
}
