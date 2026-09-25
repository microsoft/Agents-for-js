import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import jwt from 'jsonwebtoken'
import { SidecarAuthProvider } from '../../src/auth/sidecar/sidecarAuthProvider'
import { AuthConfiguration, AuthType } from '../../src/auth/authConfiguration'

interface FakeResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

function tokenResponse (token: string): FakeResponse {
  return {
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ authorizationHeader: `Bearer ${token}` })
  }
}

function signedToken (expSecondsFromNow: number): string {
  return jwt.sign({ exp: Math.floor(Date.now() / 1000) + expSecondsFromNow }, 'secret')
}

function lastUrl (fetchStub: sinon.SinonStub): URL {
  return new URL(fetchStub.lastCall.args[0] as string)
}

describe('SidecarAuthProvider', () => {
  let fetchStub: sinon.SinonStub
  const originalFetch = global.fetch
  const baseConfig: AuthConfiguration = {
    authType: AuthType.EntraAuthSideCar,
    clientId: 'client-id',
    sidecarBaseUrl: 'http://localhost:5178'
  }

  beforeEach(() => {
    fetchStub = sinon.stub()
    global.fetch = fetchStub as unknown as typeof fetch
  })

  afterEach(() => {
    sinon.restore()
    global.fetch = originalFetch
  })

  it('throws when constructed with a non-local base URL', () => {
    assert.throws(() => new SidecarAuthProvider({ ...baseConfig, sidecarBaseUrl: 'https://example.com' }))
  })

  it('does not throw for a local base URL or when bypass is enabled', () => {
    assert.doesNotThrow(() => new SidecarAuthProvider(baseConfig))
    assert.doesNotThrow(() => new SidecarAuthProvider({ ...baseConfig, sidecarBaseUrl: 'https://example.com', bypassLocalNetworkRestriction: true }))
  })

  it('getAccessToken requests an app token from the default service', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    const token = await provider.getAccessToken('https://graph.microsoft.com/.default')
    assert.ok(token.length > 0)
    const url = lastUrl(fetchStub)
    assert.strictEqual(url.pathname, '/AuthorizationHeaderUnauthenticated/default')
    assert.strictEqual(url.searchParams.get('optionsOverride.RequestAppToken'), 'true')
    assert.strictEqual(url.searchParams.get('optionsOverride.Scopes'), 'https://graph.microsoft.com/.default')
  })

  it('getAgenticApplicationToken uses the blueprint service name and tenant', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    await provider.getAgenticApplicationToken('tenant-1', 'agent-1')
    const url = lastUrl(fetchStub)
    assert.strictEqual(url.pathname, '/AuthorizationHeaderUnauthenticated/agenticblueprint')
    assert.strictEqual(url.searchParams.get('AgentIdentity'), 'agent-1')
    assert.strictEqual(url.searchParams.get('optionsOverride.AcquireTokenOptions.Tenant'), 'tenant-1')
  })

  it('getAgenticInstanceToken requests an app token for the agent identity', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider({ ...baseConfig, scopes: ['api://resource/.default'] })
    await provider.getAgenticInstanceToken('tenant-1', 'agent-1')
    const url = lastUrl(fetchStub)
    assert.strictEqual(url.pathname, '/AuthorizationHeaderUnauthenticated/default')
    assert.strictEqual(url.searchParams.get('AgentIdentity'), 'agent-1')
    assert.strictEqual(url.searchParams.get('optionsOverride.RequestAppToken'), 'true')
    assert.strictEqual(url.searchParams.get('optionsOverride.Scopes'), 'api://resource/.default')
  })

  it('getAgenticUserToken sends AgentUserId when the upn is a GUID', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    await provider.getAgenticUserToken('tenant-1', 'agent-1', '11111111-1111-1111-1111-111111111111', ['scopeA'])
    const url = lastUrl(fetchStub)
    assert.strictEqual(url.searchParams.get('AgentUserId'), '11111111-1111-1111-1111-111111111111')
    assert.strictEqual(url.searchParams.get('AgentUsername'), null)
    assert.strictEqual(url.searchParams.get('optionsOverride.Scopes'), 'scopeA')
  })

  it('getAgenticUserToken sends AgentUsername when the upn is not a GUID', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    await provider.getAgenticUserToken('tenant-1', 'agent-1', 'user@contoso.com', ['scopeA'])
    const url = lastUrl(fetchStub)
    assert.strictEqual(url.searchParams.get('AgentUsername'), 'user@contoso.com')
    assert.strictEqual(url.searchParams.get('AgentUserId'), null)
  })

  it('caches tokens and does not re-fetch within the validity window', async () => {
    fetchStub.resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    const first = await provider.getAccessToken('scope')
    const second = await provider.getAccessToken('scope')
    assert.strictEqual(first, second)
    assert.strictEqual(fetchStub.callCount, 1)
  })

  it('re-fetches when the cached token is within the expiry buffer', async () => {
    fetchStub.onFirstCall().resolves(tokenResponse(signedToken(10)))
    fetchStub.onSecondCall().resolves(tokenResponse(signedToken(3600)))
    const provider = new SidecarAuthProvider(baseConfig)
    await provider.getAccessToken('scope')
    await provider.getAccessToken('scope')
    assert.strictEqual(fetchStub.callCount, 2)
  })

  it('acquireTokenOnBehalfOf is not supported', async () => {
    const provider = new SidecarAuthProvider(baseConfig)
    await assert.rejects(() => provider.acquireTokenOnBehalfOf(['scope'], 'assertion'), /not supported/i)
  })

  it('agentic token requests require connection settings', async () => {
    const provider = new SidecarAuthProvider()
    await assert.rejects(() => provider.getAgenticApplicationToken('tenant', 'instance'), /connection settings must be provided/i)
    await assert.rejects(() => provider.getAgenticInstanceToken('tenant', 'instance'), /connection settings must be provided/i)
    await assert.rejects(() => provider.getAgenticUserToken('tenant', 'instance', 'user@contoso.com', ['scope']), /connection settings must be provided/i)
  })

  it('rejects a non-Bearer authorization scheme returned by the sidecar', async () => {
    fetchStub.resolves({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ authorizationHeader: `PoP ${signedToken(3600)}` })
    } as FakeResponse)
    const provider = new SidecarAuthProvider(baseConfig)
    await assert.rejects(() => provider.getAccessToken('https://graph.microsoft.com/.default'), /unsupported authorization scheme/i)
  })

  it('isHealthy delegates to the sidecar health endpoint', async () => {
    fetchStub.resolves({ ok: true, status: 200, text: async () => '' } as FakeResponse)
    const provider = new SidecarAuthProvider(baseConfig)
    assert.strictEqual(await provider.isHealthy(), true)
    const healthUrl = fetchStub.lastCall.args[0] as string
    assert.ok(healthUrl.endsWith('/healthz'))
  })
})
