import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { DelegatedTokenCredential } from '../../src/auth/delegatedTokenCredential'

describe('DelegatedTokenCredential', () => {
  it('getToken should forward requested scopes and options to the provider', async () => {
    let receivedScopes: string[] | undefined
    let receivedOptions: any
    const credential = new DelegatedTokenCredential(async (scopes, options) => {
      receivedScopes = scopes
      receivedOptions = options
      return { token: 'abc123' }
    })

    const options = { requestOptions: {} } as any
    const result = await credential.getToken(['scope-1', 'scope-2'], options)

    assert.deepEqual(receivedScopes, ['scope-1', 'scope-2'])
    assert.equal(receivedOptions, options)
    assert.equal(result.token, 'abc123')
  })

  it('getToken should normalize a single scope string into an array', async () => {
    let receivedScopes: string[] | undefined
    const credential = new DelegatedTokenCredential(async (scopes) => {
      receivedScopes = scopes
      return { token: 'abc123' }
    })

    await credential.getToken('single-scope')

    assert.deepEqual(receivedScopes, ['single-scope'])
  })

  it('getToken should return an access token with an assumed expiration', async () => {
    const credential = new DelegatedTokenCredential(async () => ({ token: 'abc123' }))

    const before = Date.now()
    const result = await credential.getToken(['scope'])
    const after = Date.now()

    assert.equal(result.token, 'abc123')
    assert.ok(result.expiresOnTimestamp > before)
    assert.ok(result.expiresOnTimestamp <= after + 5 * 60 * 1000)
  })

  it('getToken should throw when the provider resolves undefined', async () => {
    const credential = new DelegatedTokenCredential(async () => undefined)

    await assert.rejects(
      async () => credential.getToken(['scope']),
      /token response provider returned a null response/
    )
  })

  it('getToken should throw when the provider resolves a response without a token', async () => {
    const credential = new DelegatedTokenCredential(async () => ({ token: undefined }))

    await assert.rejects(
      async () => credential.getToken(['scope']),
      /token response provider returned a null response/
    )
  })
})
