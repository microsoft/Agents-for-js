import assert from 'node:assert'
import { describe, it } from 'node:test'
import { BlobsStorage } from '../src/blobsStorage'
import { Storage, StorageOperationStatus, StorageV2 } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'
import { Readable } from 'node:stream'

interface BlobStorageInternals {
  _containerClient: {
    getBlobClient: (key: string) => { download: () => Promise<unknown> };
  };
  _initialize: () => Promise<void>;
}

interface BlobStorageWriteInternals {
  _containerClient: {
    getBlobClient: (key: string) => { getProperties: () => Promise<unknown> };
    getBlockBlobClient: (key: string) => {
      upload: (value: string) => Promise<{ etag?: string }>;
    };
  };
  _initialize: () => Promise<void>;
}

interface BlobStorageDeleteInternals {
  _containerClient: {
    getBlobClient: (key: string) => { getProperties: () => Promise<unknown> };
    deleteBlob: (key: string, options?: unknown) => Promise<void>;
  };
  _initialize: () => Promise<void>;
}

function createStatusError (statusCode: number): Error {
  return Object.assign(
    ExceptionHelper.generateException(Error, Errors.StorageV2OperationFailed, undefined, { operation: 'test', key: 'test' }),
    { statusCode }
  )
}

describe('BlobsStorage', () => {
  for (const [authentication, url] of [
    ['an anonymous', 'https://example.blob.core.windows.net/container'],
    ['a SAS', 'https://example.blob.core.windows.net/container?sv=test&sig=test'],
  ]) {
    it(`accepts ${authentication} URL without a credential`, () => {
      assert.doesNotThrow(() => new BlobsStorage('unused', undefined, undefined, url))
    })
  }

  it('uses V1 by default and selects V2 from options', () => {
    const v1 = new BlobsStorage('unused', undefined, undefined, 'https://example.blob.core.windows.net/container')
    const v2 = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const legacyContract: Storage = v1
    const v2Contract: StorageV2 = v2
    assert.strictEqual(legacyContract, v1)
    assert.strictEqual(v2Contract, v2)
    assert.strictEqual(v1.storageVersion, 1)
    assert.strictEqual(v2.storageVersion, 2)
  })

  it('returns a not-found result for a missing blob', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const internals = storage as unknown as BlobStorageInternals
    internals._initialize = async () => {}
    internals._containerClient = {
      getBlobClient: () => ({
        download: () => Promise.reject(createStatusError(404)),
      }),
    }

    const results = await storage.read(['missing'])

    assert.strictEqual(results.missing.status, StorageOperationStatus.NotFound)
  })

  it('keeps value eTag data separate from the blob version', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const internals = storage as unknown as BlobStorageInternals
    internals._initialize = async () => {}
    internals._containerClient = {
      getBlobClient: () => ({
        download: async () => ({
          etag: 'storage-version',
          readableStreamBody: Readable.from([JSON.stringify({ eTag: 'business-value', value: 1 })]),
        }),
      }),
    }

    const result = await storage.read<{ eTag: string, value: number }>(['key'])

    assert.strictEqual(result.key.value?.eTag, 'business-value')
    assert.strictEqual(result.key.version, 'storage-version')
  })

  it('preserves value eTag data when writing a blob', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const internals = storage as unknown as BlobStorageWriteInternals
    let serialized = ''
    let versionReads = 0
    internals._initialize = async () => {}
    internals._containerClient = {
      getBlobClient: () => ({
        getProperties: async () => {
          versionReads++
          return await Promise.reject(createStatusError(404))
        },
      }),
      getBlockBlobClient: () => ({
        upload: async (value: string) => {
          serialized = value
          return { etag: 'storage-version' }
        },
      }),
    }

    await storage.write({ key: { eTag: 'business-value', value: 1 } })

    assert.deepStrictEqual(JSON.parse(serialized), { eTag: 'business-value', value: 1 })
    assert.strictEqual(versionReads, 0)
  })

  it('does not initialize Azure for empty V2 batches', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const internals = storage as unknown as BlobStorageInternals
    let initializeCalls = 0
    internals._initialize = async () => { initializeCalls++ }

    assert.deepStrictEqual(await storage.read([]), {})
    assert.deepStrictEqual(await storage.write({}), {})
    assert.deepStrictEqual(await storage.delete([]), {})
    assert.strictEqual(initializeCalls, 0)
  })

  it('does not condition an unconditional V2 delete', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )
    const internals = storage as unknown as BlobStorageDeleteInternals
    let versionReads = 0
    let deleteOptions: unknown
    internals._initialize = async () => {}
    internals._containerClient = {
      getBlobClient: () => ({
        getProperties: async () => {
          versionReads++
          return { etag: 'unexpected' }
        },
      }),
      deleteBlob: async (_key, options) => { deleteOptions = options },
    }

    const results = await storage.delete(['key'])

    assert.strictEqual(results.key.status, StorageOperationStatus.Succeeded)
    assert.strictEqual(versionReads, 0)
    assert.strictEqual(deleteOptions, undefined)
  })

  it('rejects V2 values that are not object records', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )

    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: null }),
      /values must be non-null, non-array objects/
    )
  })

  it('rejects blank V2 write keys', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )

    await assert.rejects(storage.write({ ' ': {} }), /keys must be non-empty strings/)
  })

  it('rejects unsupported V2 write modes', async () => {
    const storage = new BlobsStorage(
      'unused',
      undefined,
      { storageVersion: 2 },
      'https://example.blob.core.windows.net/container'
    )

    await assert.rejects(
      // @ts-expect-error Verify runtime validation for JavaScript callers.
      storage.write({ key: {} }, { mode: 'invalid' }),
      /write mode "invalid" is not supported/
    )
  })
})
