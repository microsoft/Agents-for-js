import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import { isTokenCredential, TokenCredential } from '@azure/core-auth'
import { AnonymousCredential, ContainerClient, StoragePipelineOptions, StorageSharedKeyCredential } from '@azure/storage-blob'
import { getStorageWriteExpiry, StorageDeleteOptions, StorageDeleteResults, StorageOperationStatus, StorageReadResults, StorageWriteMode, StorageWriteOptions, StorageWriteResults, Storage, StorageV2, StoreItems } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'
import { sanitizeBlobKey } from './blobsTranscriptStore'
import { ignoreError, isStatusCodeError } from './ignoreError'
import { trace, debug } from '@microsoft/agents-telemetry'
import { BlobsStorageTraceDefinitions } from './observability'

const logger = debug('agents:blob-storage')
const expirationMetadataKey = 'agentsstorageexpiresat'

/** Options for configuring Blob storage. */
export interface BlobsStorageOptions {
  /** Optional Azure Storage pipeline options to customize request behavior. */
  storagePipelineOptions?: StoragePipelineOptions;
}

/** Shared Blob client setup and raw Blob primitives. */
class BlobsStorageInternals {
  readonly _containerClient: ContainerClient
  private readonly _concurrency = Infinity
  private _initializePromise?: Promise<unknown>

  constructor (containerName: string, connectionString?: string, options?: BlobsStorageOptions, url = '', credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential) {
    if (url.trim() !== '') {
      z.object({ url: z.string() }).parse({ url })
      this._containerClient = new ContainerClient(url, credential, options?.storagePipelineOptions)
      if (url.trim() === 'UseDevelopmentStorage=true;') this._concurrency = 1
    } else {
      z.object({ connectionString: z.string(), containerName: z.string() }).parse({ connectionString, containerName })
      this._containerClient = new ContainerClient(connectionString!, containerName, options?.storagePipelineOptions)
      if (connectionString!.trim() === 'UseDevelopmentStorage=true;') this._concurrency = 1
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

  _initialize (): Promise<unknown> {
    if (!this._initializePromise) this._initializePromise = this._containerClient.createIfNotExists()
    return this._initializePromise
  }

  async getVersion (key: string): Promise<string | undefined> {
    try {
      return (await this._containerClient.getBlobClient(sanitizeBlobKey(key)).getProperties()).etag
    } catch (err) {
      if (isStatusCodeError(404)(err as Error)) return undefined
      throwStorageOperationError('read version', key, err)
    }
  }
}

/** A legacy Azure Blob storage provider. */
export class BlobsStorage extends BlobsStorageInternals implements Storage {
  constructor (containerName: string, connectionString?: string, options?: BlobsStorageOptions, url = '', credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential) {
    super(containerName, connectionString, options, url, credential)
  }

  /**
   * Reads legacy items from Azure Blob Storage.
   *
   * @param keys The keys to read.
   * @returns Existing items keyed by storage key. Missing blobs are omitted and returned items
   * include the Blob ETag as their legacy `eTag`.
   */
  async read (keys: string[]): Promise<StoreItems> {
    return trace(BlobsStorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      z.object({ keys: z.array(z.string()) }).parse({ keys })
      await this._initialize()
      const results = await Promise.all(keys.map(async key => {
        const result = { key, value: undefined as unknown }
        const blob = await ignoreError(this._containerClient.getBlobClient(sanitizeBlobKey(key)).download(), isStatusCodeError(404))
        if (!blob?.readableStreamBody) return result
        if (isExpired(blob.metadata?.[expirationMetadataKey])) {
          blob.readableStreamBody.destroy()
          await ignoreError(this._containerClient.deleteBlob(sanitizeBlobKey(key), { conditions: { ifMatch: blob.etag } }), isStatusCodeError(404, 412))
          return result
        }
        const parsed = await StreamConsumers.json(blob.readableStreamBody) as Record<string, unknown>
        result.value = { ...parsed, eTag: blob.etag }
        logger.debug(`Read blob: ${key}, eTag: ${blob.etag}`)
        return result
      }))
      return results.reduce<StoreItems>((items, { key, value }) => value ? { ...items, [key]: value } : items, {})
    })
  }

  /**
   * Writes legacy items to Azure Blob Storage.
   *
   * @param changes The items to write, keyed by storage key.
   * @throws If the input is invalid, Blob Storage cannot complete the write, or a legacy `eTag`
   * condition fails.
   */
  async write (changes: StoreItems, options?: StorageWriteOptions): Promise<void> {
    return trace(BlobsStorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : 0 })
      z.record(z.unknown()).parse(changes)
      const expiresAt = getStorageWriteExpiry(options)
      await this._initialize()
      await Promise.all(Object.entries(changes).map(async ([key, { eTag = '', ...change }]) => {
        try {
          const blob = this._containerClient.getBlockBlobClient(sanitizeBlobKey(key))
          const serialized = JSON.stringify(change)
          logger.debug(`Writing blob: ${key}, eTag: ${eTag}, size: ${serialized.length}`)
          const conditions = typeof eTag === 'string' && eTag !== '*'
            ? { ifMatch: eTag }
            : {}
          await blob.upload(serialized, serialized.length, {
            conditions,
            blobHTTPHeaders: { blobContentType: 'application/json' },
            metadata: expiresAt === undefined ? {} : { [expirationMetadataKey]: expiresAt.toString() },
          })
        } catch (err: any) {
          if (err.statusCode === 412) {
            throw ExceptionHelper.generateException(Error, Errors.ETagConflict, undefined, { key })
          }
          throw ExceptionHelper.generateException(Error, Errors.StorageWriteFailed, err, { key })
        }
      }))
    })
  }

  /**
   * Deletes legacy items from Azure Blob Storage.
   *
   * @param keys The keys to delete. Missing blobs are ignored.
   */
  async delete (keys: string[]): Promise<void> {
    return trace(BlobsStorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      z.object({ keys: z.array(z.string()) }).parse({ keys })
      await this._initialize()
      await Promise.all(keys.map(key => ignoreError(this._containerClient.deleteBlob(sanitizeBlobKey(key)), isStatusCodeError(404))))
    })
  }
}

/**
 * An Azure Blob Storage provider for the structured {@link StorageV2} contract.
 *
 * This is the V2 counterpart to {@link BlobsStorage} and accepts the same connection settings.
 * It returns a result for every requested key and exposes the Azure Blob ETag as the separate
 * storage `version`, preserving any `eTag` property in an application value. Writes support
 * create-only, replace, and expected-version conditions to detect concurrent updates.
 */
export class BlobsStorageV2 extends StorageV2 {
  private readonly internals: BlobsStorageInternals

  /**
   * Creates a V2 Azure Blob Storage provider.
   *
   * @param containerName The Blob container name when using a connection string.
   * @param connectionString The Azure Storage connection string.
   * @param options Optional Azure Storage pipeline options.
   * @param url The Blob service or container URL when using a credential.
   * @param credential The credential used with `url`.
   */
  constructor (containerName: string, connectionString?: string, options?: BlobsStorageOptions, url = '', credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential) {
    super()
    this.internals = new BlobsStorageInternals(containerName, connectionString, options, url, credential)
  }

  /**
   * Reads Blob values and ETag versions.
   *
   * @param keys The keys to read. Empty batches are valid.
   * @returns A result for every key, with `notFound` for missing blobs and the Blob ETag as the
   * version for successful reads.
   */
  async read<T extends object = Record<string, unknown>> (keys: string[]): Promise<StorageReadResults<T>> {
    return trace(BlobsStorageTraceDefinitions.read, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      validateV2Keys(keys)
      if (keys.length === 0) return {}
      await this.internals._initialize()
      const results: StorageReadResults<T> = {}
      await Promise.all(keys.map(async key => {
        try {
          const { etag: version, metadata, readableStreamBody } = await this.internals._containerClient.getBlobClient(sanitizeBlobKey(key)).download()
          if (!readableStreamBody) {
            results[key] = { key, status: StorageOperationStatus.NotFound }
            return
          }
          if (isExpired(metadata?.[expirationMetadataKey])) {
            readableStreamBody.destroy()
            await ignoreError(this.internals._containerClient.deleteBlob(sanitizeBlobKey(key), { conditions: { ifMatch: version } }), isStatusCodeError(404, 412))
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
    })
  }

  /**
   * Writes Blob values with optional concurrency conditions.
   *
   * @param changes The values to write, keyed by storage key.
   * @param options Create-only, replace, or expected-version conditions.
   * @returns A result for every supplied key, including Blob concurrency-condition outcomes.
   */
  async write<T extends object = Record<string, unknown>> (changes: Record<string, T>, options?: StorageWriteOptions): Promise<StorageWriteResults> {
    return trace(BlobsStorageTraceDefinitions.write, async ({ record }) => {
      record({ keyCount: changes ? Object.keys(changes).length : 0 })
      validateExpectedVersion(options?.expectedVersion)
      validateV2Changes(changes)
      const mode = options?.mode ?? StorageWriteMode.Upsert
      validateWriteMode(mode)
      if (Object.keys(changes).length === 0) return {}
      await this.internals._initialize()
      const results: StorageWriteResults = {}
      const expiresAt = getStorageWriteExpiry(options)
      await Promise.all(Object.entries(changes).map(async ([key, change]) => {
        const blob = this.internals._containerClient.getBlockBlobClient(sanitizeBlobKey(key))
        const needsCurrentVersion = mode !== StorageWriteMode.Upsert || options?.expectedVersion !== undefined
        const currentVersion = needsCurrentVersion
          ? await this.internals.getVersion(key)
          : undefined
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
            metadata: expiresAt === undefined ? {} : { [expirationMetadataKey]: expiresAt.toString() },
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
    })
  }

  /**
   * Deletes Blob values with an optional ETag version condition.
   *
   * @param keys The keys to delete. Empty batches are valid.
   * @param options An optional expected Blob ETag version.
   * @returns A result for every supplied key.
   */
  async delete (keys: string[], options?: StorageDeleteOptions): Promise<StorageDeleteResults> {
    return trace(BlobsStorageTraceDefinitions.delete, async ({ record }) => {
      record({ keyCount: keys?.length ?? 0 })
      validateExpectedVersion(options?.expectedVersion)
      validateV2Keys(keys)
      if (keys.length === 0) return {}
      await this.internals._initialize()
      const results: StorageDeleteResults = {}
      await Promise.all(keys.map(async key => {
        let currentVersion: string | undefined
        if (options?.expectedVersion !== undefined) {
          currentVersion = await this.internals.getVersion(key)
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
          const deleteOptions = options?.expectedVersion === undefined
            ? undefined
            : { conditions: { ifMatch: options.expectedVersion } }
          await this.internals._containerClient.deleteBlob(sanitizeBlobKey(key), deleteOptions)
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
    })
  }
}

function validateExpectedVersion (expectedVersion: string | undefined): void {
  if (expectedVersion === '') throw ExceptionHelper.generateException(RangeError, Errors.StorageV2ExpectedVersionEmpty)
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
  if (!Array.isArray(keys)) throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeysRequired)
  if (keys.some(key => typeof key !== 'string' || key.trim() === '')) {
    throw ExceptionHelper.generateException(ReferenceError, Errors.StorageV2KeyRequired)
  }
}

function throwStorageOperationError (operation: string, key: string, error: unknown): never {
  throw ExceptionHelper.generateException(Error, Errors.StorageV2OperationFailed, error instanceof Error ? error : undefined, { operation, key })
}

function isExpired (expiresAt?: string): boolean {
  const timestamp = Number(expiresAt)
  return Number.isFinite(timestamp) && timestamp <= Date.now()
}
