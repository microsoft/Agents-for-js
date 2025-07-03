import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import { TokenCredential } from '@azure/core-auth'
import {
  AnonymousCredential,
  ContainerClient,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { Storage, StoreItems } from '@microsoft/agents-hosting'
import { sanitizeBlobKey } from './blobsTranscriptStore'
import { ignoreError, isStatusCodeError } from './ignoreError'

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
 * A class that implements the Storage interface using Azure Blob Storage.
 * Provides persistence for bot state data using Azure's Blob Storage service.
 */
export class BlobsStorage implements Storage {
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
   */
  constructor (
    containerName: string,
    connectionString?: string,
    options?: BlobsStorageOptions,
    url = '',
    credential?: StorageSharedKeyCredential | AnonymousCredential | TokenCredential
  ) {
    if (url !== '' && credential != null) {
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

  /**
   * Reads storage items from blob storage.
   *
   * @param keys Array of item keys to read
   * @returns A promise that resolves to a StoreItems object containing the retrieved items
   * @throws Will throw if keys parameter is invalid or if there's an error reading from storage
   */
  async read (keys: string[]): Promise<StoreItems> {
    z.object({ keys: z.array(z.string()) }).parse({ keys })

    await this._initialize()

    const results = await Promise.all(keys.map(async (key) => {
      const result = { key, value: undefined }

      const blob = await ignoreError(
        this._containerClient.getBlobClient(sanitizeBlobKey(key)).download(),
        isStatusCodeError(404)
      )

      if (!blob) {
        return result
      }

      const { etag: eTag, readableStreamBody } = blob
      if (!readableStreamBody) {
        return result
      }

      const parsed = (await StreamConsumers.json(readableStreamBody)) as any
      result.value = { ...parsed, eTag }

      return result
    }))

    return results.reduce((acc, { key, value }) => (value ? { ...acc, [key]: value } : acc), {})
  }

  /**
   * Writes storage items to blob storage.
   *
   * @param changes The items to write to storage
   * @returns A promise that resolves when the write operation is complete
   * @throws Will throw if there's a validation error, eTag conflict, or other storage error
   */
  async write (changes: StoreItems): Promise<void> {
    z.record(z.unknown()).parse(changes)

    await this._initialize()

    await Promise.all(
      Object.entries(changes).map(async ([key, { eTag = '', ...change }]) => {
        try {
          const blob = this._containerClient.getBlockBlobClient(sanitizeBlobKey(key))
          const serialized = JSON.stringify(change)
          return await blob.upload(serialized, serialized.length, {
            conditions: typeof eTag === 'string' && eTag !== '*' ? { ifMatch: eTag } : {},
            blobHTTPHeaders: { blobContentType: 'application/json' },
          })
        } catch (err: any) {
          if (err.statusCode === 412) {
            throw new Error(`Storage: error writing "${key}" due to eTag conflict.`)
          } else {
            throw err
          }
        }
      })
    )
  }

  /**
   * Deletes storage items from blob storage.
   *
   * @param keys Array of item keys to delete
   * @returns A promise that resolves when the delete operation is complete
   * @throws Will throw if keys parameter is invalid
   */
  async delete (keys: string[]): Promise<void> {
    z.object({ keys: z.array(z.string()) }).parse({ keys })

    await this._initialize()

    await Promise.all(
      keys.map((key) => ignoreError(this._containerClient.deleteBlob(sanitizeBlobKey(key)), isStatusCodeError(404)))
    )
  }
}
