import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { JwtPayload } from 'jsonwebtoken'
import { ConnectionManager, defaultAuthProviderFactory, AuthProviderFactory } from '../../src/auth/connectionManager'
import { MsalConnectionManager } from '../../src/auth/msal/msalConnectionManager'
import { SidecarAuthProvider } from '../../src/auth/sidecar/sidecarAuthProvider'
import { MsalTokenProvider } from '../../src/auth/msal/msalTokenProvider'
import { AuthProvider } from '../../src/auth/authProvider'
import { AuthConfiguration, AuthType } from '../../src/auth/authConfiguration'

function fakeProvider (config: AuthConfiguration): AuthProvider {
  return { connectionSettings: config } as unknown as AuthProvider
}

const fakeFactory: AuthProviderFactory = (config) => fakeProvider(config)

describe('defaultAuthProviderFactory', () => {
  it('creates a SidecarAuthProvider for EntraAuthSideCar connections', () => {
    const provider = defaultAuthProviderFactory({ authType: AuthType.EntraAuthSideCar, clientId: 'c', sidecarBaseUrl: 'http://localhost:5178' })
    assert.ok(provider instanceof SidecarAuthProvider)
  })

  it('creates an MsalTokenProvider for all other connections', () => {
    const provider = defaultAuthProviderFactory({ authType: AuthType.ClientSecret, clientId: 'c' })
    assert.ok(provider instanceof MsalTokenProvider)
  })
})

describe('ConnectionManager', () => {
  function buildManager (factory: AuthProviderFactory = fakeFactory): ConnectionManager {
    const configs = new Map<string, AuthConfiguration>([
      ['serviceConnection', { clientId: 'svc', tenantId: 't1' }],
      ['agentic', { clientId: 'agt', tenantId: 't2' }]
    ])
    const connectionsMap = [
      { audience: 'aud-1', serviceUrl: 'https://.*\\.botframework\\.com/.*', connection: 'serviceConnection' },
      { serviceUrl: '*', connection: 'agentic' }
    ]
    return new ConnectionManager(factory, configs, connectionsMap)
  }

  it('getConnection returns the named connection', () => {
    const mgr = buildManager()
    const conn = mgr.getConnection('agentic')
    assert.strictEqual(conn.connectionSettings?.clientId, 'agt')
  })

  it('getConnection throws for an unknown connection', () => {
    const mgr = buildManager()
    assert.throws(() => mgr.getConnection('missing'), /Connection not found/)
  })

  it('getDefaultConnection returns the wildcard mapped connection', () => {
    const mgr = buildManager()
    const conn = mgr.getDefaultConnection()
    assert.strictEqual(conn.connectionSettings?.clientId, 'agt')
  })

  it('getTokenProvider matches on audience and serviceUrl regex', () => {
    const mgr = buildManager()
    const identity = { aud: 'aud-1' } as JwtPayload
    const conn = mgr.getTokenProvider(identity, 'https://smba.botframework.com/amer/')
    assert.strictEqual(conn.connectionSettings?.clientId, 'svc')
  })

  it('getTokenProvider falls back to the wildcard map item when audience does not match', () => {
    const mgr = buildManager()
    const identity = { aud: 'other-aud' } as JwtPayload
    const conn = mgr.getTokenProvider(identity, 'https://anything/')
    assert.strictEqual(conn.connectionSettings?.clientId, 'agt')
  })

  it('getTokenProvider throws when identity is missing', () => {
    const mgr = buildManager()
    assert.throws(() => mgr.getTokenProvider(undefined as unknown as JwtPayload, 'url'), /Identity is required/)
  })

  it('uses the default connection when no connectionsMap is configured', () => {
    const configs = new Map<string, AuthConfiguration>([['serviceConnection', { clientId: 'svc' }]])
    const mgr = new ConnectionManager(fakeFactory, configs, [])
    const identity = { aud: 'any' } as JwtPayload
    const conn = mgr.getTokenProvider(identity, 'https://x/')
    assert.strictEqual(conn.connectionSettings?.clientId, 'svc')
  })

  it('getDefaultConnectionConfiguration returns the serviceConnection config', () => {
    const mgr = buildManager()
    assert.strictEqual(mgr.getDefaultConnectionConfiguration().clientId, 'svc')
  })

  it('does not mutate connection settings (no-op applyConnectionDefaults)', () => {
    const mgr = buildManager()
    const conn = mgr.getConnection('agentic')
    assert.strictEqual(conn.connectionSettings?.authorityEndpoint, undefined)
    assert.strictEqual(conn.connectionSettings?.issuers, undefined)
  })
})

describe('MsalConnectionManager', () => {
  it('applies MSAL authority and issuer defaults on getConnection', () => {
    const configs = new Map<string, AuthConfiguration>([
      ['serviceConnection', { clientId: 'svc', tenantId: 'tenant-1', authType: AuthType.ClientSecret }]
    ])
    const mgr = new MsalConnectionManager(configs, [])
    const conn = mgr.getConnection('serviceConnection')
    assert.strictEqual(conn.connectionSettings?.authorityEndpoint, 'https://login.microsoftonline.com')
    assert.ok(Array.isArray(conn.connectionSettings?.issuers))
    assert.ok(conn.connectionSettings?.issuers?.some(issuer => issuer === 'https://api.botframework.com'))
  })

  it('dispatches EntraAuthSideCar connections to SidecarAuthProvider', () => {
    const configs = new Map<string, AuthConfiguration>([
      ['serviceConnection', { clientId: 'svc', authType: AuthType.EntraAuthSideCar, sidecarBaseUrl: 'http://localhost:5178' }]
    ])
    const mgr = new MsalConnectionManager(configs, [])
    const conn = mgr.getConnection('serviceConnection')
    assert.ok(conn instanceof SidecarAuthProvider)
  })
})
