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

    const decodeStub = sinon.stub(jwt, 'decode').returns({ aud: config.clientId })

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
  })
})
