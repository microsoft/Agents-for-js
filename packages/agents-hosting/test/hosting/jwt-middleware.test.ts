import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import jwt from 'jsonwebtoken'
import { Response, NextFunction } from 'express'
import { authorizeJWT, buildJwksUri, clearJwksClients, AuthConfiguration, Request } from '../../src'
import { getJwksClient } from '../../src/auth/jwt-middleware'

describe('authorizeJWT', () => {
  let req: Request
  let res: Partial<Response>
  let next: NextFunction
  let config: AuthConfiguration
  let connections: Map<string, AuthConfiguration>

  beforeEach(() => {
    clearJwksClients()
    req = {
      headers: {},
      method: 'POST',
      user: { aud: 'client-id' }
    }
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }

    next = sinon.stub() as unknown as NextFunction

    connections = new Map<string, AuthConfiguration>()
    connections.set('test', {
      clientId: 'client-id',
      tenantId: 'tenant-id',
      issuers: ['issuer'],
      authority: 'http://login.microsoftonline.com'
    })

    config = {
      tenantId: 'tenant-id',
      clientId: 'client-id',
      issuers: ['issuer'],
      connections
    }
  })

  afterEach(() => {
    clearJwksClients()
    sinon.restore()
  })

  it('should call next with no error if token is valid', async () => {
    const token = 'valid-token'
    req.headers.authorization = `Bearer ${token}`
    req.user = { aud: config.clientId }

    const decodeStub = sinon.stub(jwt, 'decode').returns({ aud: config.clientId, iss: 'issuer' })

    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(null, { aud: config.clientId })
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((next as sinon.SinonStub).calledOnce)
    assert((next as sinon.SinonStub).calledWith())

    decodeStub.restore()
    verifyStub.restore()
  })

  it('should authenticate when the configured client ID is one of multiple token audiences', async () => {
    const token = 'valid-token'
    const audiences = ['secondary-audience', config.clientId!]
    req.headers.authorization = ['Bear', 'er ', token].join('')

    const decodeStub = sinon.stub(jwt, 'decode').returns({ aud: audiences })
    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(null, { aud: audiences })
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((next as sinon.SinonStub).calledOnce)
    assert((res.status as sinon.SinonStub).notCalled)

    decodeStub.restore()
    verifyStub.restore()
  })

  it('should respond with 401 if token is missing', async () => {
    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(401))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'authorization header not found' }))
    const nextStub = next as sinon.SinonStub
    assert(nextStub.notCalled)
  })

  it('should respond with 401 if token is invalid', async () => {
    const token = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJjbGllbnQtaWQiLCJpc3MiOiJodHRwczovL2FwaS5ib3RmcmFtZXdvcmsuY29tIn0.signature'
    req.headers.authorization = `Bearer ${token}`

    const decodeStub = sinon.stub(jwt, 'decode').returns({
      aud: config.clientId,
      iss: 'https://api.botframework.com'
    })

    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(new jwt.JsonWebTokenError('invalid token'), 'stub error')
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(401))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'invalid token' }))
    const nextStub = next as sinon.SinonStub
    assert(nextStub.notCalled)

    decodeStub.restore()
    verifyStub.restore()
  })

  it('should respond with 405 if method not allowed', async () => {
    req.method = 'OPTIONS' // Simulate a method that is not allowed

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(405))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'Method not allowed' }))
    const nextStub = next as sinon.SinonStub
    assert(nextStub.notCalled)
  })

  it('should authenticate when a valid Bearer token is not the first array entry', async () => {
    const token = 'valid-token'
    // Duplicate Authorization headers preserved as an array, Bearer is second.
    req.headers.authorization = ['Basic dXNlcjpwYXNz', `Bearer ${token}`]
    req.user = { aud: config.clientId }

    const decodeStub = sinon.stub(jwt, 'decode').returns({ aud: config.clientId })
    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(null, { aud: config.clientId })
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((next as sinon.SinonStub).calledOnce)
    assert((next as sinon.SinonStub).calledWith())
    assert((res.status as sinon.SinonStub).notCalled)

    decodeStub.restore()
    verifyStub.restore()
  })

  it('should respond with 401 when an array Authorization header has no valid Bearer entry', async () => {
    req.headers.authorization = ['Basic dXNlcjpwYXNz', 'NotBearer abc']

    await authorizeJWT(config)(req as Request, res as Response, next)

    const nextStub: sinon.SinonStub = next as sinon.SinonStub
    assert((res.status as sinon.SinonStub).calledOnceWith(401))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'invalid authorization header' }))
    assert(nextStub.notCalled)
  })

  it('should respond with 401 and a stable message when a non-Error is thrown', async () => {
    req.headers.authorization = 'Bearer some-token'
    // A thrown value without `.description` or `.message` must not serialize to {}.
    const thrown: any = { kind: 'not-an-error' }
    const decodeStub = sinon.stub(jwt, 'decode').callsFake(() => { throw thrown })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(401))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'unauthorized' }))
    assert((next as sinon.SinonStub).notCalled)

    decodeStub.restore()
  })

  it('should evict least-recently-used JWKS clients after the cache size limit is reached', async () => {
    const firstClient = getJwksClient('https://login.microsoftonline.com/tenant-0/discovery/v2.0/keys')
    let secondClient

    for (let i = 1; i < 100; i++) {
      const client = getJwksClient(`https://login.microsoftonline.com/tenant-${i}/discovery/v2.0/keys`)
      if (i === 1) {
        secondClient = client
      }
    }

    assert.strictEqual(getJwksClient('https://login.microsoftonline.com/tenant-0/discovery/v2.0/keys'), firstClient)

    getJwksClient('https://login.microsoftonline.com/tenant-100/discovery/v2.0/keys')
    assert.strictEqual(getJwksClient('https://login.microsoftonline.com/tenant-0/discovery/v2.0/keys'), firstClient)
    assert.notStrictEqual(getJwksClient('https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys'), secondClient)
    assert.notStrictEqual(getJwksClient('https://login.microsoftonline.com/tenant-1/discovery/v2.0/keys'), secondClient)
  })

  describe('buildJwksUri', () => {
    it('should use botframework keys URI for botframework issuer', () => {
      const authConfig: AuthConfiguration = { clientId: 'client-id', tenantId: 'tenant-id' }
      assert.strictEqual(
        buildJwksUri('https://api.botframework.com', authConfig),
        'https://login.botframework.com/v1/.well-known/keys'
      )
    })

    it('should use the gov botframework keys URI for the gov botframework issuer', () => {
      const authConfig: AuthConfiguration = { clientId: 'client-id', tenantId: 'tenant-id' }
      assert.strictEqual(
        buildJwksUri('https://api.botframework.us', authConfig),
        'https://login.botframework.azure.us/v1/.well-known/keys'
      )
    })

    it('should build JWKS URI from authority and tenantId', () => {
      const authConfig: AuthConfiguration = {
        clientId: 'client-id',
        authority: 'https://login.microsoftonline.com',
        tenantId: 'my-tenant'
      }
      assert.strictEqual(
        buildJwksUri('https://sts.windows.net/my-tenant/', authConfig),
        'https://login.microsoftonline.com/my-tenant/discovery/v2.0/keys'
      )
    })

    it('should build JWKS URI when tenant is embedded in authority', () => {
      const authConfig: AuthConfiguration = {
        clientId: 'client-id',
        authority: 'https://login.microsoftonline.com/my-tenant'
      }
      assert.strictEqual(
        buildJwksUri('https://sts.windows.net/my-tenant/', authConfig),
        'https://login.microsoftonline.com/my-tenant/discovery/v2.0/keys'
      )
    })

    it('should not produce a double-tenant URI when tenant is embedded in authority', () => {
      const authConfig: AuthConfiguration = {
        clientId: 'client-id',
        authority: 'https://login.microsoftonline.com/my-tenant',
        tenantId: 'my-tenant'
      }
      const uri = buildJwksUri('https://sts.windows.net/my-tenant/', authConfig)
      assert.strictEqual(uri, 'https://login.microsoftonline.com/my-tenant/discovery/v2.0/keys')
      assert.ok(!uri.includes('my-tenant/my-tenant'), 'URI should not contain double tenant')
    })

    it('should preserve the configured authority route when the issuer claim is missing or malformed', () => {
      const authConfig: AuthConfiguration = {
        clientId: 'client-id',
        tenantId: 'my-tenant',
        authority: 'https://login.microsoftonline.com'
      }
      assert.strictEqual(
        buildJwksUri(undefined as unknown as string, authConfig),
        'https://login.microsoftonline.com/my-tenant/discovery/v2.0/keys'
      )
      assert.strictEqual(
        buildJwksUri({ malformed: true } as unknown as string, authConfig),
        'https://login.microsoftonline.com/my-tenant/discovery/v2.0/keys'
      )
    })
  })
})

describe('authorizeJWT issuer validation', () => {
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
    next = sinon.stub() as unknown as NextFunction
  })

  afterEach(() => {
    sinon.restore()
  })

  const makeConfig = (connection: AuthConfiguration): AuthConfiguration => {
    const connections = new Map<string, AuthConfiguration>([['default', connection]])
    return { clientId: connection.clientId, tenantId: connection.tenantId, connections }
  }

  // Drives authorizeJWT with a decoded token whose `aud` matches the connection, whose `iss` is
  // the provided value and whose `tid` is the optional provided value. jwt.verify is stubbed to
  // succeed so the only gates exercised are the issuer allow-list and tenant-binding checks.
  const run = async (connection: AuthConfiguration, iss: unknown, tid?: unknown) => {
    const effectiveConnection = { validateIssuer: true, ...connection }
    const config = makeConfig(effectiveConnection)
    const req = { headers: { authorization: 'Bearer token' }, method: 'POST', user: {} } as unknown as Request
    sinon.stub(jwt, 'decode').returns({ aud: effectiveConnection.clientId, iss, tid } as unknown as Record<string, unknown>)
    sinon.stub(jwt, 'verify').callsFake((_t, _k, _o, cb) => {
      if (typeof cb === 'function') cb(null, { aud: effectiveConnection.clientId, iss, tid })
    })
    await authorizeJWT(config)(req, res as Response, next)
    return req
  }

  const assertRejected = () => {
    assert((res.status as sinon.SinonStub).calledOnceWith(401), 'expected 401')
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'Issuer mismatch' }), 'expected issuer mismatch body')
    assert((next as sinon.SinonStub).notCalled, 'next should not be called')
  }

  const assertAccepted = (req: Request) => {
    assert((next as sinon.SinonStub).calledOnce, 'next should be called once')
    assert((res.status as sinon.SinonStub).notCalled, 'status should not be set on success')
    assert.ok(req.user, 'req.user should be populated')
  }

  it('does not validate the issuer unless explicitly enabled', async () => {
    const req = await run(
      {
        clientId: 'client-id',
        tenantId: 'home-tenant',
        issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'],
        validateIssuer: false
      },
      'https://unrelated.example.com/token'
    )
    assertAccepted(req)
  })

  it('rejects a signature-valid token from an unrelated tenant (cross-tenant bypass)', async () => {
    await run(
      {
        clientId: 'client-id',
        tenantId: 'home-tenant',
        issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'],
        authority: 'https://login.microsoftonline.com'
      },
      'https://login.microsoftonline.com/attacker-tenant/v2.0'
    )
    assertRejected()
  })

  it('rejects a token with a missing issuer claim', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'home-tenant', issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'] },
      undefined
    )
    assertRejected()
  })

  it('rejects a token with a non-string issuer claim', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'home-tenant', issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'] },
      { evil: true }
    )
    assertRejected()
  })

  it('accepts a token whose issuer matches the configured connection issuer', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'home-tenant', issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'] },
      'https://login.microsoftonline.com/home-tenant/v2.0'
    )
    assertAccepted(req)
  })

  it('accepts the Bot Framework channel issuer (api.botframework.com)', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'home-tenant', issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'] },
      'https://api.botframework.com'
    )
    assertAccepted(req)
  })

  it('accepts a well-known Microsoft first-party tenant issuer not present in configured issuers', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'home-tenant', issuers: ['https://login.microsoftonline.com/home-tenant/v2.0'] },
      'https://sts.windows.net/f8cdef31-a31e-4b4a-93e4-5f571e91255a/',
      'f8cdef31-a31e-4b4a-93e4-5f571e91255a'
    )
    assertAccepted(req)
  })

  it('matches issuers case-insensitively (tolerates tenant GUID casing)', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'My-Tenant', issuers: ['https://STS.windows.net/My-Tenant/'] },
      'https://sts.windows.net/my-tenant/'
    )
    assertAccepted(req)
  })

  it('falls back to tenant-scoped defaults when the matched connection has no configured issuers', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'my-tenant', authority: 'https://login.microsoftonline.com' },
      'https://login.microsoftonline.com/my-tenant/v2.0'
    )
    assertAccepted(req)
  })

  it('rejects a public-tenant token when the connection has no issuers and a different tenant', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'my-tenant', authority: 'https://login.microsoftonline.com' },
      'https://login.microsoftonline.com/other-tenant/v2.0'
    )
    assertRejected()
  })

  it('accepts the government Bot Framework issuer when authority is a gov endpoint', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'gov-tenant', authority: 'https://login.microsoftonline.us' },
      'https://api.botframework.us'
    )
    assertAccepted(req)
  })

  it('rejects the public Bot Framework issuer for a gov connection with no configured issuers', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'gov-tenant', authority: 'https://login.microsoftonline.us' },
      'https://api.botframework.com'
    )
    assertRejected()
  })
})

describe('authorizeJWT tenant binding (signing key issuer validation)', () => {
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
    next = sinon.stub() as unknown as NextFunction
  })

  afterEach(() => {
    sinon.restore()
  })

  const TENANT_A = '11111111-1111-1111-1111-111111111111'
  const TENANT_B = '22222222-2222-2222-2222-222222222222'

  const makeConfig = (connection: AuthConfiguration): AuthConfiguration => {
    const connections = new Map<string, AuthConfiguration>([['default', connection]])
    return { clientId: connection.clientId, tenantId: connection.tenantId, connections }
  }

  const run = async (
    connection: AuthConfiguration,
    iss: unknown,
    tid: unknown,
    verifiedIss: unknown = iss,
    verifiedTid: unknown = tid
  ) => {
    const config = makeConfig(connection)
    const req = { headers: { authorization: 'Bearer token' }, method: 'POST', user: {} } as unknown as Request
    sinon.stub(jwt, 'decode').returns({ aud: connection.clientId, iss, tid } as unknown as Record<string, unknown>)
    sinon.stub(jwt, 'verify').callsFake((_t, _k, _o, cb) => {
      if (typeof cb === 'function') cb(null, { aud: connection.clientId, iss: verifiedIss, tid: verifiedTid })
    })
    await authorizeJWT(config)(req, res as Response, next)
    return req
  }

  const assertTenantRejected = () => {
    assert((res.status as sinon.SinonStub).calledOnceWith(401), 'expected 401')
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'Tenant mismatch' }), 'expected tenant mismatch body')
    assert((next as sinon.SinonStub).notCalled, 'next should not be called')
  }

  const assertAccepted = (req: Request) => {
    assert((next as sinon.SinonStub).calledOnce, 'next should be called once')
    assert((res.status as sinon.SinonStub).notCalled, 'status should not be set on success')
    assert.ok(req.user, 'req.user should be populated')
  }

  it('rejects a token whose tid claim does not match the issuer tenant (v2 issuer)', async () => {
    await run(
      { clientId: 'client-id', tenantId: TENANT_A, issuers: [`https://login.microsoftonline.com/${TENANT_A}/v2.0`] },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      TENANT_B
    )
    assertTenantRejected()
  })

  it('rejects a token whose tid claim does not match the issuer tenant (v1 issuer)', async () => {
    await run(
      { clientId: 'client-id', tenantId: TENANT_A, issuers: [`https://sts.windows.net/${TENANT_A}/`] },
      `https://sts.windows.net/${TENANT_A}/`,
      TENANT_B
    )
    assertTenantRejected()
  })

  it('accepts an Entra token that is missing the tid claim', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A, issuers: [`https://login.microsoftonline.com/${TENANT_A}/v2.0`] },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      undefined
    )
    assertAccepted(req)
  })

  it('accepts an Entra token whose tid claim is not a string', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      42
    )
    assertAccepted(req)
  })

  it('validates the signed payload rather than the unverified decoded claims', async () => {
    await run(
      { clientId: 'client-id', tenantId: TENANT_A },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      TENANT_A,
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      TENANT_B
    )
    assertTenantRejected()
  })

  it('accepts a token whose tid matches the issuer tenant (case-insensitive)', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A, issuers: [`https://login.microsoftonline.com/${TENANT_A}/v2.0`] },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      TENANT_A.toUpperCase()
    )
    assertAccepted(req)
  })

  it('does not bind alias-based issuers (non-GUID tenant segment) to the tid claim', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'contoso', issuers: ['https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0'] },
      'https://login.microsoftonline.com/contoso.onmicrosoft.com/v2.0',
      TENANT_A
    )
    assertAccepted(req)
  })

  it('does not bind a v1 issuer without its canonical trailing slash', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A },
      `https://sts.windows.net/${TENANT_A}`,
      TENANT_B
    )
    assertAccepted(req)
  })

  it('does not bind a v2 issuer with a noncanonical trailing slash', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A },
      `https://login.microsoftonline.com/${TENANT_A}/v2.0/`,
      TENANT_B
    )
    assertAccepted(req)
  })

  it('does not bind a v2 issuer with noncanonical path casing', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A },
      `https://login.microsoftonline.com/${TENANT_A}/V2.0`,
      TENANT_B
    )
    assertAccepted(req)
  })

  it('does not bind the Azure Bot Service issuer (no tid claim) to a tenant', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: TENANT_A, issuers: [`https://login.microsoftonline.com/${TENANT_A}/v2.0`] },
      'https://api.botframework.com',
      undefined
    )
    assertAccepted(req)
  })
})

describe('authorizeJWT multi-tenant (blueprint) issuer validation', () => {
  let res: Partial<Response>
  let next: NextFunction

  beforeEach(() => {
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }
    next = sinon.stub() as unknown as NextFunction
  })

  afterEach(() => {
    sinon.restore()
  })

  const CALLER_TENANT = '33333333-3333-3333-3333-333333333333'
  const OTHER_TENANT = '44444444-4444-4444-4444-444444444444'

  const makeConfig = (connection: AuthConfiguration): AuthConfiguration => {
    const connections = new Map<string, AuthConfiguration>([['default', connection]])
    return { clientId: connection.clientId, tenantId: connection.tenantId, connections }
  }

  const run = async (connection: AuthConfiguration, iss: unknown, tid: unknown) => {
    const effectiveConnection = { validateIssuer: true, ...connection }
    const config = makeConfig(effectiveConnection)
    const req = { headers: { authorization: 'Bearer token' }, method: 'POST', user: {} } as unknown as Request
    sinon.stub(jwt, 'decode').returns({ aud: effectiveConnection.clientId, iss, tid } as unknown as Record<string, unknown>)
    sinon.stub(jwt, 'verify').callsFake((_t, _k, _o, cb) => {
      if (typeof cb === 'function') cb(null, { aud: effectiveConnection.clientId, iss, tid })
    })
    await authorizeJWT(config)(req, res as Response, next)
    return req
  }

  const assertRejectedWith = (body: string) => {
    assert((res.status as sinon.SinonStub).calledOnceWith(401), 'expected 401')
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': body }), `expected body ${body}`)
    assert((next as sinon.SinonStub).notCalled, 'next should not be called')
  }

  const assertAccepted = (req: Request) => {
    assert((next as sinon.SinonStub).calledOnce, 'next should be called once')
    assert((res.status as sinon.SinonStub).notCalled, 'status should not be set on success')
    assert.ok(req.user, 'req.user should be populated')
  }

  it('accepts an arbitrary consented tenant issuer when authority is /common', async () => {
    const req = await run(
      { clientId: 'client-id', authority: 'https://login.microsoftonline.com/common' },
      `https://login.microsoftonline.com/${CALLER_TENANT}/v2.0`,
      CALLER_TENANT
    )
    assertAccepted(req)
  })

  it('accepts an arbitrary consented tenant issuer when tenantId is "organizations"', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'organizations', authority: 'https://login.microsoftonline.com' },
      `https://login.microsoftonline.com/${CALLER_TENANT}/v2.0`,
      CALLER_TENANT
    )
    assertAccepted(req)
  })

  it('still enforces the tid binding for an accepted multi-tenant issuer', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'common' },
      `https://login.microsoftonline.com/${CALLER_TENANT}/v2.0`,
      OTHER_TENANT
    )
    assertRejectedWith('Tenant mismatch')
  })

  it('rejects a non-Entra issuer even in multi-tenant mode', async () => {
    await run(
      { clientId: 'client-id', tenantId: 'common' },
      'https://evil.example.com/token',
      CALLER_TENANT
    )
    assertRejectedWith('Issuer mismatch')
  })

  it('still accepts the Azure Bot Service channel issuer in multi-tenant mode', async () => {
    const req = await run(
      { clientId: 'client-id', tenantId: 'common' },
      'https://api.botframework.com',
      undefined
    )
    assertAccepted(req)
  })

  it('enforces cloud affinity: a public-cloud /common agent rejects a gov-cloud issuer', async () => {
    await run(
      { clientId: 'client-id', authority: 'https://login.microsoftonline.com/common' },
      `https://login.microsoftonline.us/${CALLER_TENANT}/v2.0`,
      CALLER_TENANT
    )
    assertRejectedWith('Issuer mismatch')
  })

  it('enforces cloud affinity: a gov-cloud /common agent accepts a gov-cloud issuer', async () => {
    const req = await run(
      { clientId: 'client-id', authority: 'https://login.microsoftonline.us/common' },
      `https://login.microsoftonline.us/${CALLER_TENANT}/v2.0`,
      CALLER_TENANT
    )
    assertAccepted(req)
  })

  it('enforces cloud affinity: a gov-cloud /common agent rejects a public-cloud issuer', async () => {
    await run(
      { clientId: 'client-id', authority: 'https://login.microsoftonline.us/common' },
      `https://login.microsoftonline.com/${CALLER_TENANT}/v2.0`,
      CALLER_TENANT
    )
    assertRejectedWith('Issuer mismatch')
  })

  it('does not weaken single-tenant agents: a concrete-tenant agent still rejects another tenant', async () => {
    await run(
      {
        clientId: 'client-id',
        tenantId: CALLER_TENANT,
        issuers: [`https://login.microsoftonline.com/${CALLER_TENANT}/v2.0`],
        authority: 'https://login.microsoftonline.com'
      },
      `https://login.microsoftonline.com/${OTHER_TENANT}/v2.0`,
      OTHER_TENANT
    )
    assertRejectedWith('Issuer mismatch')
  })
})
