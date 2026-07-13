import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import { SidecarHttpClient } from '../../src/auth/sidecar/sidecarHttpClient'

interface FakeResponse {
  ok: boolean
  status: number
  text: () => Promise<string>
}

function makeResponse (status: number, body: unknown, ok?: boolean): FakeResponse {
  return {
    ok: ok ?? (status >= 200 && status < 300),
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  }
}

describe('SidecarHttpClient', () => {
  let fetchStub: sinon.SinonStub
  const originalFetch = global.fetch
  const originalSidecarUrl = process.env.SIDECAR_URL

  beforeEach(() => {
    delete process.env.SIDECAR_URL
    fetchStub = sinon.stub()
    global.fetch = fetchStub as unknown as typeof fetch
  })

  afterEach(() => {
    sinon.restore()
    global.fetch = originalFetch
    if (originalSidecarUrl === undefined) {
      delete process.env.SIDECAR_URL
    } else {
      process.env.SIDECAR_URL = originalSidecarUrl
    }
  })

  describe('resolveBaseUrl', () => {
    it('prefers the SIDECAR_URL environment variable', () => {
      process.env.SIDECAR_URL = 'http://127.0.0.1:6000'
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl('http://localhost:1234'), 'http://127.0.0.1:6000')
    })

    it('falls back to the configured URL when env is unset', () => {
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl('http://localhost:1234'), 'http://localhost:1234')
    })

    it('falls back to the default when neither env nor config is set', () => {
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl(), 'http://localhost:5178')
    })

    it('treats whitespace-only values as unset', () => {
      process.env.SIDECAR_URL = '   '
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl('   '), 'http://localhost:5178')
    })

    it('trims surrounding whitespace from the env URL', () => {
      process.env.SIDECAR_URL = '  http://127.0.0.1:6000  '
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl('http://localhost:1234'), 'http://127.0.0.1:6000')
    })

    it('trims surrounding whitespace from the configured URL', () => {
      assert.strictEqual(SidecarHttpClient.resolveBaseUrl('  http://localhost:1234  '), 'http://localhost:1234')
    })
  })

  describe('validateBaseUrl', () => {
    it('allows loopback hosts', () => {
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://localhost:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://127.0.0.1:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[::1]:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[0:0:0:0:0:0:0:1]:5000', false))
    })

    it('allows private network hosts', () => {
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://10.1.2.3', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://172.16.0.1', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://192.168.0.5', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://169.254.1.1', false))
    })

    it('allows private/loopback IPv6 hosts', () => {
      // Link-local across the full fe80::/10 range, not just fe80::/16.
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[fe80::1]:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[feb0::1]:5000', false))
      // Unique local fc00::/7.
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[fc00::1]:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[fd12:3456::1]:5000', false))
      // Site-local fec0::/10 (deprecated).
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[fec0::1]:5000', false))
      // IPv4-mapped loopback in dotted and hex-compressed forms.
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[::ffff:127.0.0.1]:5000', false))
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('http://[::ffff:7f00:1]:5000', false))
    })

    it('rejects the IPv6 unspecified address (::) which is not loopback', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://[::]:5000', false))
    })

    it('rejects public IPv6 hosts including IPv4-mapped public addresses', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://[2001:4860:4860::8888]:5000', false))
      // ::ffff:8.8.8.8 (hex-compressed ::ffff:808:808) must not be treated as private.
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://[::ffff:8.8.8.8]:5000', false))
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://[::ffff:808:808]:5000', false))
    })

    it('rejects public hosts unless bypass is set', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('https://example.com', false))
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://8.8.8.8', false))
    })

    it('allows public hosts when bypass is set', () => {
      assert.doesNotThrow(() => SidecarHttpClient.validateBaseUrl('https://example.com', true))
    })

    it('rejects non-http(s) schemes', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('ftp://localhost', false))
      assert.throws(() => SidecarHttpClient.validateBaseUrl('file:///etc/passwd', true))
    })

    it('rejects URLs with userinfo', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('http://user:pass@localhost:5000', false))
    })

    it('does not leak userinfo credentials in the thrown error', () => {
      assert.throws(
        () => SidecarHttpClient.validateBaseUrl('http://user:s3cr3t@localhost:5000', false),
        (err: Error & { description?: string }) => {
          const text = `${err.message ?? ''} ${err.description ?? ''}`
          assert.ok(!text.includes('s3cr3t'), 'error must not contain the password')
          assert.ok(!text.includes('user:'), 'error must not contain the userinfo')
          return true
        }
      )
    })

    it('rejects malformed URLs', () => {
      assert.throws(() => SidecarHttpClient.validateBaseUrl('not-a-url', true))
    })
  })

  describe('getAuthorizationHeaderUnauthenticated', () => {
    it('parses a bearer authorization header', async () => {
      fetchStub.resolves(makeResponse(200, { authorizationHeader: 'Bearer abc.def.ghi' }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      const result = await client.getAuthorizationHeaderUnauthenticated('default')
      assert.strictEqual(result.scheme, 'Bearer')
      assert.strictEqual(result.token, 'abc.def.ghi')
    })

    it('defaults the scheme to Bearer when no space is present', async () => {
      fetchStub.resolves(makeResponse(200, { authorizationHeader: 'rawtoken' }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      const result = await client.getAuthorizationHeaderUnauthenticated('default')
      assert.strictEqual(result.scheme, 'Bearer')
      assert.strictEqual(result.token, 'rawtoken')
    })

    it('throws when the authorization header is only a known scheme', async () => {
      for (const header of ['Bearer', 'bearer', 'PoP']) {
        fetchStub.resolves(makeResponse(200, { authorizationHeader: header }))
        const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
        await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /authorizationHeader/i)
      }
    })

    it('throws when the authorization header has a scheme but an empty token', async () => {
      for (const header of ['Bearer ', 'PoP   ']) {
        fetchStub.resolves(makeResponse(200, { authorizationHeader: header }))
        const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
        await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /authorizationHeader/i)
      }
    })

    it('builds the request URL with the expected query parameters', async () => {
      fetchStub.resolves(makeResponse(200, { authorizationHeader: 'Bearer t' }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      await client.getAuthorizationHeaderUnauthenticated('myservice', {
        agentIdentity: 'agent-id',
        agentUsername: 'user@contoso.com',
        scopes: ['scope1', 'scope2'],
        requestAppToken: true,
        tenant: 'tenant-id',
        forceRefresh: true
      })
      const calledUrl = new URL(fetchStub.firstCall.args[0] as string)
      assert.strictEqual(calledUrl.pathname, '/AuthorizationHeaderUnauthenticated/myservice')
      assert.strictEqual(calledUrl.searchParams.get('AgentIdentity'), 'agent-id')
      assert.strictEqual(calledUrl.searchParams.get('AgentUsername'), 'user@contoso.com')
      assert.deepStrictEqual(calledUrl.searchParams.getAll('optionsOverride.Scopes'), ['scope1', 'scope2'])
      assert.strictEqual(calledUrl.searchParams.get('optionsOverride.RequestAppToken'), 'true')
      assert.strictEqual(calledUrl.searchParams.get('optionsOverride.AcquireTokenOptions.Tenant'), 'tenant-id')
      assert.strictEqual(calledUrl.searchParams.get('optionsOverride.AcquireTokenOptions.ForceRefresh'), 'true')
    })

    it('throws when AgentUsername and AgentUserId are both supplied', async () => {
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      await assert.rejects(
        () => client.getAuthorizationHeaderUnauthenticated('default', { agentUsername: 'u', agentUserId: 'id' }),
        /mutually exclusive/i
      )
      assert.strictEqual(fetchStub.called, false)
    })

    it('throws when the response is missing the authorizationHeader field', async () => {
      fetchStub.resolves(makeResponse(200, { somethingElse: true }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /authorizationHeader/i)
    })

    it('throws when the response body is not valid JSON', async () => {
      fetchStub.resolves(makeResponse(200, 'not json {'))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /unparsable/i)
    })

    it('throws on a non-transient error status with problem details', async () => {
      fetchStub.resolves(makeResponse(400, { title: 'Bad Request', detail: 'upn=user@contoso.com tenant=abc' }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 2, 1)
      // The thrown error surfaces the title/status but must never echo the (potentially PII-bearing) detail.
      await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), (err: Error) => {
        assert.match(err.message, /400/)
        assert.match(err.message, /Bad Request/)
        assert.doesNotMatch(err.message, /contoso\.com/)
        assert.doesNotMatch(err.message, /tenant=abc/)
        return true
      })
      assert.strictEqual(fetchStub.callCount, 1)
    })

    it('retries on a transient status then succeeds', async () => {
      fetchStub.onFirstCall().resolves(makeResponse(503, { title: 'unavailable' }))
      fetchStub.onSecondCall().resolves(makeResponse(200, { authorizationHeader: 'Bearer ok' }))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 2, 1)
      const result = await client.getAuthorizationHeaderUnauthenticated('default')
      assert.strictEqual(result.token, 'ok')
      assert.strictEqual(fetchStub.callCount, 2)
    })

    it('retries on a network error then surfaces the failure', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 1, 1)
      await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /failed after 2 attempt/i)
      assert.strictEqual(fetchStub.callCount, 2)
    })

    it('falls back to defaults when retryCount/timeout are NaN (no infinite retry loop)', async () => {
      fetchStub.rejects(new Error('ECONNREFUSED'))
      const client = new SidecarHttpClient('http://localhost:5000', NaN, NaN, 1)
      await assert.rejects(() => client.getAuthorizationHeaderUnauthenticated('default'), /failed after/i)
      assert.strictEqual(fetchStub.callCount, SidecarHttpClient.DEFAULT_RETRY_COUNT + 1)
    })
  })

  describe('isHealthy', () => {
    it('returns true when the health endpoint responds ok', async () => {
      fetchStub.resolves(makeResponse(200, ''))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      assert.strictEqual(await client.isHealthy(), true)
      const calledUrl = fetchStub.firstCall.args[0] as string
      assert.ok(calledUrl.endsWith('/healthz'))
    })

    it('returns false when the health endpoint throws', async () => {
      fetchStub.rejects(new Error('down'))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      assert.strictEqual(await client.isHealthy(), false)
    })

    it('returns false when the health endpoint responds with an error status', async () => {
      fetchStub.resolves(makeResponse(500, '', false))
      const client = new SidecarHttpClient('http://localhost:5000', 1000, 0, 1)
      assert.strictEqual(await client.isHealthy(), false)
    })
  })
})
