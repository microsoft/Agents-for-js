import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import sinon from 'sinon'
import jwt from 'jsonwebtoken'
import { Response, NextFunction } from 'express'
import { authorizeJWT, buildJwksUri, AuthConfiguration, Request } from '../../src'

describe('authorizeJWT', () => {
  let req: Request
  let res: Partial<Response>
  let next: NextFunction
  let config: AuthConfiguration
  let connections: Map<string, AuthConfiguration>

  beforeEach(() => {
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
    assert((next as sinon.SinonStub).notCalled)
  })

  it('should respond with 401 if token is invalid', async () => {
    const token = 'invalid-token'
    req.headers.authorization = `Bearer ${token}`

    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(new jwt.JsonWebTokenError('invalid token'), 'stub error')
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(401))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'invalid token' }))
    assert((next as sinon.SinonStub).notCalled)

    verifyStub.restore()
  })

  it('should respond with 405 if method not allowed', async () => {
    req.method = 'OPTIONS' // Simulate a method that is not allowed

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((res.status as sinon.SinonStub).calledOnceWith(405))
    assert((res.send as sinon.SinonStub).calledOnceWith({ 'jwt-auth-error': 'Method not allowed' }))
    assert((next as sinon.SinonStub).notCalled)
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
