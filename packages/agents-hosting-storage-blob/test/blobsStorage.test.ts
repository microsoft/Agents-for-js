import assert from 'node:assert'
import { describe, it } from 'node:test'
import { BlobsStorage } from '../src/blobsStorage'
import { Storage, StorageOperationStatus, StorageV2 } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

interface BlobStorageInternals {
  _containerClient: {
    getBlobClient: (key: string) => { download: () => Promise<unknown> };
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
