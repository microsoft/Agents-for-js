import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import sinon from 'sinon'
import { ConfidentialClientApplication, ManagedIdentityApplication } from '@azure/msal-node'
import { MsalTokenProvider, AuthConfiguration } from '../../src'
import fs from 'fs'
import crypto from 'crypto'

describe('MsalTokenProvider', () => {
  let msalTokenProvider: MsalTokenProvider
  let authConfig: AuthConfiguration

  beforeEach(() => {
    msalTokenProvider = new MsalTokenProvider()
    authConfig = {
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      tenantId: 'test-tenant-id',
      certPemFile: 'test-cert.pem',
      certKeyFile: 'test-key.pem',
      issuers: ['test-issuer']
    }
  })

  it('should return empty string if clientId is missing and not in production', async () => {
    authConfig.clientId = ''
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, '')
  })

  it('should acquire access token via secret', async () => {
    // @ts-ignore
    const acquireTokenStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
    acquireTokenStub.restore()
  })

  it('should acquire token with certificate', async () => {
    authConfig.clientSecret = undefined
    // @ts-ignore
    const acquireTokenStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    sinon.stub(fs, 'readFileSync').returns('test-cert')
    // @ts-ignore
    sinon.stub(crypto, 'createPrivateKey').returns({ export: () => 'test-key' })
    sinon.stub(crypto, 'X509Certificate').returns({ fingerprint: 'test-fingerprint' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
    acquireTokenStub.restore()
  })

  it('should acquire token with user assigned identity', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    // @ts-ignore
    const acquireTokenStub = sinon.stub(ManagedIdentityApplication.prototype, 'acquireToken').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
    acquireTokenStub.restore()
  })

  it('should acquire token with Fic', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.FICClientId = 'test-fic-client-id'
    // @ts-ignore
    sinon.stub(ManagedIdentityApplication.prototype, 'acquireToken').resolves({ accessToken: 'test-token' })
    // @ts-ignore
    const acquireTokenStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
    acquireTokenStub.restore()
  })

  it('should throw error for invalid authConfig', async () => {
    authConfig.tenantId = undefined
    authConfig.clientId = '1111'
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = '33'
    await assert.rejects(msalTokenProvider.getAccessToken(authConfig, 'scope'), '[Error: Invalid authConfig.]'

    )
  })
})
