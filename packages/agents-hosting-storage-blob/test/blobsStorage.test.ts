import assert from 'node:assert'
import { describe, it } from 'node:test'
import { BlobsStorage } from '../src/blobsStorage'

describe('BlobsStorage', () => {
  for (const [authentication, url] of [
    ['an anonymous', 'https://example.blob.core.windows.net/container'],
    ['a SAS', 'https://example.blob.core.windows.net/container?sv=test&sig=test'],
  ]) {
    it(`accepts ${authentication} URL without a credential`, () => {
      assert.doesNotThrow(() => new BlobsStorage('unused', undefined, undefined, url))
    })
  }
})
