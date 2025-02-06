// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import * as z from 'zod'
import { Storage, StoreItem } from '@microsoft/agents-bot-hosting'
import { BlobServiceClient, ContainerClient, StoragePipelineOptions } from '@azure/storage-blob'
import StreamConsumers from 'stream/consumers'

export interface AzureBlobStorageOptions {
  storagePipelineOptions?: StoragePipelineOptions
  decodeKey?: boolean
}

export class AzureBlobStorage implements Storage {
  private containerClient: ContainerClient
  private _initializePromise?: Promise<unknown>
  private readonly options?: AzureBlobStorageOptions

  constructor (connectionString: string, containerName: string, options?: AzureBlobStorageOptions) {
    z.object({ connectionString: z.string(), containerName: z.string() }).parse({
      connectionString,
      containerName,
    })

    if (!connectionString) {
      throw new ReferenceError('ConnectionString is required.')
    }
    if (!containerName) {
      throw new ReferenceError('ContainerName is required.')
    }

    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
    this.containerClient = blobServiceClient.getContainerClient(containerName)
    this.options = options
  }

  private async _initialize (): Promise<unknown> {
    if (!this._initializePromise) {
      this._initializePromise = this.containerClient.createIfNotExists()
    }
    return this._initializePromise
  }

  private sanitizeKey (key: string): string {
    if (!key || key.length === 0) {
      throw new Error('Please provide a non-empty key')
    }

    const sanitized = encodeURIComponent(key).substr(0, 1024)
    return this.options?.decodeKey ? decodeURIComponent(sanitized) : sanitized
  }

  async read (keys: string[]): Promise<StoreItem> {
    await this._initialize()
    z.array(z.string()).parse(keys)

    const storeItems: StoreItem = {}
    const readPromises = keys.map(async (key) => {
      const sanitizedKey = this.sanitizeKey(key)
      const blockBlobClient = this.containerClient.getBlockBlobClient(sanitizedKey)
      try {
        const downloadResponse = await blockBlobClient.download(0)
        if (!downloadResponse.readableStreamBody) {
          return
        }
        const content = await StreamConsumers.text(downloadResponse.readableStreamBody)
        storeItems[key] = JSON.parse(content)
      } catch (error) {
        if ((error as any).statusCode !== 404) {
          throw error
        }
      }
    })

    await Promise.all(readPromises)
    return storeItems
  }

  async write (changes: StoreItem): Promise<void> {
    await this._initialize()
    z.record(z.unknown()).parse(changes)

    const writePromises = Object.entries(changes).map(async ([key, value]) => {
      const sanitizedKey = this.sanitizeKey(key)
      const blockBlobClient = this.containerClient.getBlockBlobClient(sanitizedKey)
      const data = JSON.stringify(value)
      const metadata = {
        timestamp: new Date().toISOString(),
        contentType: 'application/json'
      }
      await blockBlobClient.upload(data, data.length, { metadata })
    })

    await Promise.all(writePromises)
  }

  async delete (keys: string[]): Promise<void> {
    await this._initialize()
    z.array(z.string()).parse(keys)

    const deletePromises = keys.map(async (key) => {
      const sanitizedKey = this.sanitizeKey(key)
      const blockBlobClient = this.containerClient.getBlockBlobClient(sanitizedKey)
      try {
        await blockBlobClient.delete()
      } catch (error) {
        if ((error as any).statusCode !== 404) {
          throw error
        }
      }
    })

    await Promise.all(deletePromises)
  }
}
