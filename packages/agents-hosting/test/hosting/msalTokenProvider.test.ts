import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import sinon from 'sinon'
import { ConfidentialClientApplication, ManagedIdentityApplication } from '@azure/msal-node'
import { MsalTokenProvider, AuthConfiguration } from '../../src'
import fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'

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

  it('should acquire token with WID', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.WIDAssertionFile = '/etc/issue'
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
    await assert.rejects(msalTokenProvider.getAccessToken(authConfig, 'scope'), '[Error: Invalid authConfig.]')
  })

  it('should replace `common` with tenant id', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      authority: 'https://foo.bar.com/common',
      tenantId: 'original-tenant-id',
    })

    // disable the cache

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      // Assert that axios.post was called
      assert.strictEqual(axiosPostStub.called, true)

      // Check the URL it was called with - should have the tenant-id, not 'common'
      const callArgs = axiosPostStub.getCall(0).args
      const url = callArgs[0]
      assert.ok(url === 'https://foo.bar.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'tenant-id', got: ${url}`)
      assert.ok(!url.includes('common'), `Expected URL to NOT contain 'common', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
      axiosPostStub.restore()
    }
  })

  it('should use login.microsoftonline.com/tenantId if common is not specified in authority', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      tenantId: 'original-tenant-id',
    })

    // disable the cache

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      // Assert that axios.post was called
      assert.strictEqual(axiosPostStub.called, true)

      // Check the URL it was called with - should have the tenant-id, not 'common'
      const callArgs = axiosPostStub.getCall(0).args
      const url = callArgs[0]
      assert.ok(url === 'https://login.microsoftonline.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'tenant-id', got: ${url}`)
      assert.ok(!url.includes('common'), `Expected URL to NOT contain 'common', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
      axiosPostStub.restore()
    }
  })

  it('should use authority from config if no tenant id is passed in', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      authority: 'http://foo.bar',
      tenantId: 'original-tenant-id',
    })

    // disable the cache

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('', 'agent-app-instance-id')

      // Assert that axios.post was called
      assert.strictEqual(axiosPostStub.called, true)

      // Check the URL it was called with - should have the tenant-id, not 'common'
      const callArgs = axiosPostStub.getCall(0).args
      const url = callArgs[0]
      assert.ok(url === 'http://foo.bar/oauth2/v2.0/token', `Expected URL to contain 'foo.bar', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
      axiosPostStub.restore()
    }
  })

  it('should use tenant id from from config if no authority url and no agentic tenant id is passed in', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      tenantId: 'original-tenant-id',
    })

    // disable the cache

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('', 'agent-app-instance-id')

      // Assert that axios.post was called
      assert.strictEqual(axiosPostStub.called, true)

      // Check the URL it was called with - should have the tenant-id, not 'common'
      const callArgs = axiosPostStub.getCall(0).args
      const url = callArgs[0]
      assert.ok(url === 'https://login.microsoftonline.com/original-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'https://login.microsoftonline.com/original-tenant-id/oauth2/v2.0/token', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
      axiosPostStub.restore()
    }
  })
})
