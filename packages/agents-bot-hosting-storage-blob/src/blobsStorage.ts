import * as z from 'zod'
import StreamConsumers from 'stream/consumers'
import {
  AnonymousCredential,
  ContainerClient,
  StoragePipelineOptions,
  StorageSharedKeyCredential,
} from '@azure/storage-blob'
import { Storage, StoreItems } from '@microsoft/agents-bot-hosting'
import { sanitizeBlobKey } from './blobsTranscriptStore'
import { ignoreError, isStatusCodeError } from './ignoreError'

/**
 * Options for configuring the BlobsStorage.
 */
export interface BlobsStorageOptions {
  storagePipelineOptions?: StoragePipelineOptions;
}

/**
 * A class that implements the Storage interface using Azure Blob Storage.
 */
export class BlobsStorage implements Storage {
  private readonly _containerClient: ContainerClient
  private readonly _concurrency = Infinity
  private _initializePromise?: Promise<unknown>

  constructor (
    connectionString: string,
    containerName: string,
    options?: BlobsStorageOptions,
    url = '',
    credential?: StorageSharedKeyCredential | AnonymousCredential
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
        connectionString,
        containerName,
        options?.storagePipelineOptions
      )

      if (connectionString.trim() === 'UseDevelopmentStorage=true;') {
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

  async delete (keys: string[]): Promise<void> {
    z.object({ keys: z.array(z.string()) }).parse({ keys })

    await this._initialize()

    await Promise.all(
      keys.map((key) => ignoreError(this._containerClient.deleteBlob(sanitizeBlobKey(key)), isStatusCodeError(404)))
    )
  }
}
