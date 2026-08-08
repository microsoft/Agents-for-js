import assert from 'assert'
import { Readable } from 'stream'
import { describe, it } from 'node:test'
import { BlobsStorage } from '../src'

describe('BlobsStorage TTL', () => {
  it('should write expiry metadata when ttl is provided', async () => {
    let uploadOptions: any
    const storage = Object.create(BlobsStorage.prototype) as BlobsStorage
    const storageAsAny = storage as any
    storageAsAny._containerClient = {
      createIfNotExists: async () => undefined,
      getBlockBlobClient: () => ({
        upload: async (_body: string, _length: number, options: any) => {
          uploadOptions = options
        }
      })
    }

    await storage.write({ key1: { value: 'test' } }, { ttl: 60 })

    assert.strictEqual(typeof uploadOptions.metadata.agentsstorageexpiresat, 'string')
    assert.ok(Number(uploadOptions.metadata.agentsstorageexpiresat) > Date.now())
  })

  it('should omit expired blobs on read and attempt cleanup', async () => {
    let deletedBlobName: string | undefined
    let deleteOptions: any
    const storage = Object.create(BlobsStorage.prototype) as BlobsStorage
    const storageAsAny = storage as any
    storageAsAny._containerClient = {
      createIfNotExists: async () => undefined,
      getBlobClient: () => ({
        download: async () => ({
          etag: 'etag-1',
          metadata: { agentsstorageexpiresat: (Date.now() - 1000).toString() },
          readableStreamBody: Readable.from(['{"value":"test"}'])
        })
      }),
      deleteBlob: async (name: string, options: any) => {
        deletedBlobName = name
        deleteOptions = options
      }
    }

    const result = await storage.read(['key1'])

    assert.deepStrictEqual(result, {})
    assert.strictEqual(deletedBlobName, '%2Fkey1')
    assert.deepStrictEqual(deleteOptions, { conditions: { ifMatch: 'etag-1' } })
  })

  it('should ignore cleanup conflicts when expired blob was replaced', async () => {
    const storage = Object.create(BlobsStorage.prototype) as BlobsStorage
    const storageAsAny = storage as any
    storageAsAny._containerClient = {
      createIfNotExists: async () => undefined,
      getBlobClient: () => ({
        download: async () => ({
          etag: 'etag-1',
          metadata: { agentsstorageexpiresat: (Date.now() - 1000).toString() },
          readableStreamBody: Readable.from(['{"value":"test"}'])
        })
      }),
      deleteBlob: async (_name: string, _options: any) => {
        const err: any = new Error('precondition failed')
        err.statusCode = 412
        throw err
      }
    }

    const result = await storage.read(['key1'])

    assert.deepStrictEqual(result, {})
  })
})
