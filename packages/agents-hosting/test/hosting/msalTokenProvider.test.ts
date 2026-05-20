import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import { ConfidentialClientApplication, ManagedIdentityApplication } from '@azure/msal-node'
import { MsalTokenProvider, ConnectorClient, AuthConfiguration, AuthType, CloudAdapter } from '../../src'
import fs from 'fs'
import crypto from 'crypto'
import axios from 'axios'
import jwt from 'jsonwebtoken'
import { MemoryCache } from '../../src/auth/MemoryCache'

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

  afterEach(() => {
    sinon.restore()
  })

  it('should return empty string if clientId is missing and not in production', async () => {
    authConfig.clientId = ''
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, '')
  })

  it('should acquire access token via secret', async () => {
    // @ts-ignore
    sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with certificate', async () => {
    authConfig.clientSecret = undefined
    // @ts-ignore
    sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    sinon.stub(fs, 'readFileSync').returns('test-cert')
    // @ts-ignore
    sinon.stub(crypto, 'createPrivateKey').returns({ export: () => 'test-key' })
    sinon.stub(crypto, 'X509Certificate').returns({ fingerprint: 'test-fingerprint' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with user assigned identity', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    // @ts-ignore
    sinon.stub(ManagedIdentityApplication.prototype, 'acquireToken').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with system managed identity without managedIdentityIdParams', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.authtype = AuthType.SystemManagedIdentity

    sinon.stub(ManagedIdentityApplication.prototype, 'acquireToken').callsFake(async function (this: any, request: any) {
      assert.strictEqual(this.config.managedIdentityId.id, 'system_assigned_managed_identity')
      assert.strictEqual(this.config.managedIdentityId.idType, 'system-assigned')
      assert.notStrictEqual(this.config.managedIdentityId.id, authConfig.clientId)
      assert.strictEqual(request.resource, 'scope')
      return { accessToken: 'test-token' } as any
    })

    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with Fic', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.FICClientId = 'test-fic-client-id'
    // @ts-ignore
    sinon.stub(ManagedIdentityApplication.prototype, 'acquireToken').resolves({ accessToken: 'test-token' })
    // @ts-ignore
    sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with WID', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.WIDAssertionFile = '/var/run/secrets/azure/tokens/azure-identity-token'
    sinon.stub(fs, 'readFileSync').returns('fake-wid-assertion')
    // @ts-ignore
    sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
  })

  it('should acquire token with WID using authtype and federatedtokenfile', async () => {
    authConfig.clientSecret = undefined
    authConfig.certPemFile = undefined
    authConfig.certKeyFile = undefined
    authConfig.WIDAssertionFile = undefined
    authConfig.authtype = AuthType.WorkloadIdentity
    authConfig.federatedtokenfile = '/var/run/secrets/azure/tokens/azure-identity-token'
    sinon.stub(fs, 'readFileSync').returns('fake-wid-assertion')
    // @ts-ignore
    sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'test-token' })
    const token = await msalTokenProvider.getAccessToken(authConfig, 'scope')
    assert.strictEqual(token, 'test-token')
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
      authority: 'https://foo.bar.com',
      tenantId: 'common',
    })

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
    }
  })

  it('should use login.microsoftonline.com/tenantId if common is not specified in authority', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      tenantId: 'common',
    })

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('A0000009-0000-0000-0000-0000000000AF', 'agent-app-instance-id')

      // Assert that axios.post was called
      assert.strictEqual(axiosPostStub.called, true)

      // Check the URL it was called with - should have the tenant-id, not 'common'
      const callArgs = axiosPostStub.getCall(0).args
      const url = callArgs[0]
      assert.ok(url === 'https://login.microsoftonline.com/A0000009-0000-0000-0000-0000000000AF/oauth2/v2.0/token', `Expected URL to contain 'A0000009-0000-0000-0000-0000000000AF', got: ${url}`)
      assert.ok(!url.includes('common'), `Expected URL to NOT contain 'common', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })

  it('should use authority from config if no tenant id is passed in', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      authority: 'http://foo.bar',
      tenantId: 'original-tenant-id',
    })

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
      assert.ok(url === 'http://foo.bar/original-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'foo.bar', got: ${url}`)
    } finally {
      // stop caching
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })

  it('should use tenant id from config if no authority url and no agentic tenant id is passed in', async () => {
    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      tenantId: 'original-tenant-id',
    })

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
    }
  })

  it('should call the right authority for multi-tenant setups based on incoming message', async () => {
    const adapter = new CloudAdapter({
      clientId: 'client-id',
      tenantId: 'common',
      clientSecret: 'client-secret',
      authority: 'https://foo.bar.com',
    })

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    const connectorClientStub = sinon.stub(ConnectorClient, 'createClientWithToken').resolves({} as any)

    const memoryCacheStub = sinon.stub(MemoryCache.prototype, 'set').resolves(undefined)

    // @ts-ignore
    const ConfidentialClientApplicationStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({
      accessToken: 'test-access-token',
      expiresOn: new Date(Date.now() + 3600 * 1000)
    })

    // Create a mock Express response object
    const res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis()
    } as any

    await adapter.process(
      {
        headers: {},
        user: {
          aud: 'aud',
        },
        body: { type: 'message', conversation: { id: 'agentic-conversation-id' }, serviceUrl: 'https://service.url', recipient: { id: 'user1', role: 'agenticAppInstance', tenantId: 'agentic-tenant-id', agenticAppId: 'agentic-app-id' } }
      },
      res, async () => { })

    // Assert that axios.post was called
    assert.strictEqual(axiosPostStub.called, true)
    assert.strictEqual(connectorClientStub.called, true)
    assert.strictEqual(memoryCacheStub.called, true)
    assert.strictEqual(ConfidentialClientApplicationStub.called, true)

    // Check the URL it was called with - should have the tenant-id, not 'common'
    const callArgs = axiosPostStub.getCall(0).args
    const url = callArgs[0]
    assert.ok(url === 'https://foo.bar.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'foo.bar', got: ${url}`)
  })

  it('should properly handle common with custom authority url as tenantId based on incoming message', async () => {
    const adapter = new CloudAdapter({
      clientId: 'client-id',
      tenantId: 'common',
      clientSecret: 'client-secret',
      authority: 'https://foo.bar.com',
    })

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    const connectorClientStub = sinon.stub(ConnectorClient, 'createClientWithToken').resolves({} as any)

    const memoryCacheStub = sinon.stub(MemoryCache.prototype, 'set').resolves(undefined)

    // @ts-ignore
    const ConfidentialClientApplicationStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({
      accessToken: 'test-access-token',
      expiresOn: new Date(Date.now() + 3600 * 1000)
    })

    // Create a mock Express response object
    const res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis()
    } as any

    await adapter.process(
      {
        headers: {},
        user: {
          aud: 'aud',
        },
        body: { type: 'message', conversation: { id: 'agentic-conversation-id' }, serviceUrl: 'https://service.url', recipient: { id: 'user1', role: 'agenticAppInstance', tenantId: 'agentic-tenant-id', agenticAppId: 'agentic-app-id' } }
      },
      res, async () => { })

    // Assert that axios.post was called
    assert.strictEqual(axiosPostStub.called, true)
    assert.strictEqual(connectorClientStub.called, true)
    assert.strictEqual(memoryCacheStub.called, true)
    assert.strictEqual(ConfidentialClientApplicationStub.called, true)

    // Check the URL it was called with - should have the tenant-id, not 'common'
    const callArgs = axiosPostStub.getCall(0).args
    const url = callArgs[0]
    assert.ok(url === 'https://foo.bar.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'foo.bar', got: ${url}`)
  })

  it('should call the common/multi-tenant authority based on incoming message', async () => {
    const adapter = new CloudAdapter({
      clientId: 'client-id',
      tenantId: 'common',
      clientSecret: 'client-secret',
    })

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    const connectorClientStub = sinon.stub(ConnectorClient, 'createClientWithToken').resolves({} as any)

    const memoryCacheStub = sinon.stub(MemoryCache.prototype, 'set').resolves(undefined)

    // @ts-ignore
    const ConfidentialClientApplicationStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({
      accessToken: 'test-access-token',
      expiresOn: new Date(Date.now() + 3600 * 1000)
    })

    // Create a mock Express response object
    const res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis()
    } as any

    await adapter.process(
      {
        headers: {},
        user: {
          aud: 'aud',
        },
        body: { type: 'message', conversation: { id: 'agentic-conversation-id' }, serviceUrl: 'https://service.url', recipient: { id: 'user1', role: 'agenticAppInstance', tenantId: 'agentic-tenant-id', agenticAppId: 'agentic-app-id' } }
      },
      res, async () => { })

    // Assert that axios.post was called
    assert.strictEqual(axiosPostStub.called, true)
    assert.strictEqual(connectorClientStub.called, true)
    assert.strictEqual(memoryCacheStub.called, true)
    assert.strictEqual(ConfidentialClientApplicationStub.called, true)

    // Check the URL it was called with - should have the tenant-id, not 'common'
    const callArgs = axiosPostStub.getCall(0).args
    const url = callArgs[0]
    assert.ok(url === 'https://login.microsoftonline.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'https://login.microsoftonline.com/agentic-tenant-id/oauth2/v2.0/token', got: ${url}`)
  })

  it('should prefer passed tenant id over configured tenant id in authority resolution', async () => {
    const adapter = new CloudAdapter({
      clientId: 'client-id',
      tenantId: 'original-tenant-id',
      clientSecret: 'client-secret',
    })

    // Spy on axios.post
    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: {
        access_token: 'test-access-token',
        expires_in: 3600
      }
    })

    const connectorClientStub = sinon.stub(ConnectorClient, 'createClientWithToken').resolves({} as any)

    const memoryCacheStub = sinon.stub(MemoryCache.prototype, 'set').resolves(undefined)

    // @ts-ignore
    const ConfidentialClientApplicationStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({
      accessToken: 'test-access-token',
      expiresOn: new Date(Date.now() + 3600 * 1000)
    })

    // Create a mock Express response object
    const res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
      end: sinon.stub().returnsThis()
    } as any

    await adapter.process(
      {
        headers: {},
        user: {
          aud: 'aud',
        },
        body: { type: 'message', conversation: { id: 'agentic-conversation-id' }, serviceUrl: 'https://service.url', recipient: { id: 'user1', role: 'agenticAppInstance', tenantId: 'agentic-tenant-id', agenticAppId: 'agentic-app-id' } }
      },
      res, async () => { })

    // Assert that axios.post was called
    assert.strictEqual(axiosPostStub.called, true)
    assert.strictEqual(connectorClientStub.called, true)
    assert.strictEqual(memoryCacheStub.called, true)
    assert.strictEqual(ConfidentialClientApplicationStub.called, true)

    // The passed agentic-tenant-id should be preferred over the configured original-tenant-id
    const callArgs = axiosPostStub.getCall(0).args
    const url = callArgs[0]
    assert.ok(url === 'https://login.microsoftonline.com/agentic-tenant-id/oauth2/v2.0/token', `Expected URL to contain 'agentic-tenant-id', got: ${url}`)
  })

  it('should include x5c in JWT header when sendX5C is true', async () => {
    const fakePem = '-----BEGIN CERTIFICATE-----\nMIIFakeCert\n-----END CERTIFICATE-----'
    const fakeKey = '-----BEGIN PRIVATE KEY-----\nMIIFakeKey\n-----END PRIVATE KEY-----'
    const fakeRaw = Buffer.from('fake-der-data')

    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      certPemFile: '/path/to/cert.pem',
      certKeyFile: '/path/to/key.pem',
      sendX5C: true,
      tenantId: 'test-tenant-id',
    })

    const readFileSyncStub = sinon.stub(fs, 'readFileSync')
    readFileSyncStub.withArgs('/path/to/key.pem').returns(Buffer.from(fakeKey))
    readFileSyncStub.withArgs('/path/to/cert.pem').returns(Buffer.from(fakePem))

    // @ts-ignore
    sinon.stub(crypto, 'X509Certificate').returns({ raw: fakeRaw })

    const fakeDigest = Buffer.from('fake-digest')
    sinon.stub(crypto, 'createHash').returns({ update: sinon.stub().returnsThis(), digest: sinon.stub().returns(fakeDigest) } as any)

    const jwtSignStub = sinon.stub(jwt, 'sign').returns('fake-jwt-token' as any)

    sinon.stub(axios, 'post').resolves({
      data: { access_token: 'test-access-token', expires_in: 3600 }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      assert.strictEqual(jwtSignStub.called, true)
      const signOptions = jwtSignStub.getCall(0).args[2] as jwt.SignOptions & { header: any }
      assert.strictEqual(signOptions.header.x5c, fakePem, 'x5c header should contain the PEM certificate contents')
      assert.strictEqual(signOptions.header.alg, 'PS256')
      assert.strictEqual(signOptions.header.typ, 'JWT')
      assert.ok(signOptions.header['x5t#S256'], 'x5t#S256 thumbprint should be present')
    } finally {
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })

  it('should not include x5c in JWT header when sendX5C is false', async () => {
    const fakePem = '-----BEGIN CERTIFICATE-----\nMIIFakeCert\n-----END CERTIFICATE-----'
    const fakeKey = '-----BEGIN PRIVATE KEY-----\nMIIFakeKey\n-----END PRIVATE KEY-----'
    const fakeRaw = Buffer.from('fake-der-data')

    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      certPemFile: '/path/to/cert.pem',
      certKeyFile: '/path/to/key.pem',
      sendX5C: false,
      tenantId: 'test-tenant-id',
    })

    const readFileSyncStub = sinon.stub(fs, 'readFileSync')
    readFileSyncStub.withArgs('/path/to/key.pem').returns(Buffer.from(fakeKey))
    readFileSyncStub.withArgs('/path/to/cert.pem').returns(Buffer.from(fakePem))

    // @ts-ignore
    sinon.stub(crypto, 'X509Certificate').returns({ raw: fakeRaw })

    const fakeDigest = Buffer.from('fake-digest')
    sinon.stub(crypto, 'createHash').returns({ update: sinon.stub().returnsThis(), digest: sinon.stub().returns(fakeDigest) } as any)

    const jwtSignStub = sinon.stub(jwt, 'sign').returns('fake-jwt-token' as any)

    sinon.stub(axios, 'post').resolves({
      data: { access_token: 'test-access-token', expires_in: 3600 }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      assert.strictEqual(jwtSignStub.called, true)
      const signOptions = jwtSignStub.getCall(0).args[2] as jwt.SignOptions & { header: any }
      assert.strictEqual(signOptions.header.x5c, undefined, 'x5c header should not be set when sendX5C is false')
    } finally {
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })

  it('should not include x5c in JWT header when sendX5C is undefined', async () => {
    const fakePem = '-----BEGIN CERTIFICATE-----\nMIIFakeCert\n-----END CERTIFICATE-----'
    const fakeKey = '-----BEGIN PRIVATE KEY-----\nMIIFakeKey\n-----END PRIVATE KEY-----'
    const fakeRaw = Buffer.from('fake-der-data')

    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      certPemFile: '/path/to/cert.pem',
      certKeyFile: '/path/to/key.pem',
      tenantId: 'test-tenant-id',
    })

    const readFileSyncStub = sinon.stub(fs, 'readFileSync')
    readFileSyncStub.withArgs('/path/to/key.pem').returns(Buffer.from(fakeKey))
    readFileSyncStub.withArgs('/path/to/cert.pem').returns(Buffer.from(fakePem))

    // @ts-ignore
    sinon.stub(crypto, 'X509Certificate').returns({ raw: fakeRaw })

    const fakeDigest = Buffer.from('fake-digest')
    sinon.stub(crypto, 'createHash').returns({ update: sinon.stub().returnsThis(), digest: sinon.stub().returns(fakeDigest) } as any)

    const jwtSignStub = sinon.stub(jwt, 'sign').returns('fake-jwt-token' as any)

    sinon.stub(axios, 'post').resolves({
      data: { access_token: 'test-access-token', expires_in: 3600 }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      assert.strictEqual(jwtSignStub.called, true)
      const signOptions = jwtSignStub.getCall(0).args[2] as jwt.SignOptions & { header: any }
      assert.strictEqual(signOptions.header.x5c, undefined, 'x5c header should not be set when sendX5C is not provided')
    } finally {
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })

  it('should pass azureRegion to acquireTokenByClientCredential when configured', async () => {
    const acquireTokenStub = sinon.stub(ConfidentialClientApplication.prototype, 'acquireTokenByClientCredential').resolves({ accessToken: 'regional-token' } as any)

    const provider = new MsalTokenProvider({
      clientId: 'client-id',
      clientSecret: 'secret',
      tenantId: 'tenant-id',
      azureRegion: 'westus',
    })

    const token = await provider.getAccessToken('https://graph.microsoft.com')
    assert.strictEqual(token, 'regional-token')
    assert.strictEqual(acquireTokenStub.called, true)
    const requestArg = acquireTokenStub.getCall(0).args[0] as any
    assert.strictEqual(requestArg.azureRegion, 'westus', 'azureRegion must be forwarded to acquireTokenByClientCredential')
  })

  it('should pass x5c as the client_assertion in the token request when sendX5C is true', async () => {
    const fakePem = '-----BEGIN CERTIFICATE-----\nMIIFakeCert\n-----END CERTIFICATE-----'
    const fakeKey = '-----BEGIN PRIVATE KEY-----\nMIIFakeKey\n-----END PRIVATE KEY-----'
    const fakeRaw = Buffer.from('fake-der-data')

    const tokenProvider = new MsalTokenProvider({
      clientId: 'client-id',
      certPemFile: '/path/to/cert.pem',
      certKeyFile: '/path/to/key.pem',
      sendX5C: true,
      tenantId: 'test-tenant-id',
    })

    const readFileSyncStub = sinon.stub(fs, 'readFileSync')
    readFileSyncStub.withArgs('/path/to/key.pem').returns(Buffer.from(fakeKey))
    readFileSyncStub.withArgs('/path/to/cert.pem').returns(Buffer.from(fakePem))

    // @ts-ignore
    sinon.stub(crypto, 'X509Certificate').returns({ raw: fakeRaw })

    const fakeDigest = Buffer.from('fake-digest')
    sinon.stub(crypto, 'createHash').returns({ update: sinon.stub().returnsThis(), digest: sinon.stub().returns(fakeDigest) } as any)

    sinon.stub(jwt, 'sign').returns('fake-jwt-with-x5c' as any)

    const axiosPostStub = sinon.stub(axios, 'post').resolves({
      data: { access_token: 'test-access-token', expires_in: 3600 }
    })

    try {
      await tokenProvider.getAgenticApplicationToken('agentic-tenant-id', 'agent-app-instance-id')

      assert.strictEqual(axiosPostStub.called, true)
      const postData = axiosPostStub.getCall(0).args[1] as any
      assert.strictEqual(postData.client_assertion, 'fake-jwt-with-x5c', 'client_assertion should be the JWT signed with x5c')
      assert.strictEqual(postData.client_assertion_type, 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer')
    } finally {
      // @ts-ignore
      tokenProvider._agenticTokenCache.destroy()
    }
  })
})
