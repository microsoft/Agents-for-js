import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import sinon from 'sinon'
import jwt from 'jsonwebtoken'
import { Response, NextFunction } from 'express'
import { authorizeJWT, AuthConfiguration, Request } from '../../src'

describe('authorizeJWT', () => {
  let req: Request
  let res: Partial<Response>
  let next: NextFunction
  let config: AuthConfiguration

  beforeEach(() => {
    req = {
      headers: {},
      method: 'POST',
    }
    res = {
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis()
    }

    next = sinon.stub() as unknown as NextFunction

    config = {
      tenantId: 'tenant-id',
      clientId: 'client-id',
      issuers: ['issuer']
    }
  })

  it('should call next with no error if token is valid', async () => {
    const token = 'valid-token'
    req.headers.authorization = `Bearer ${token}`

    const verifyStub = sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
      if (callback) {
        callback(null, { aud: config.clientId })
      }
    })

    await authorizeJWT(config)(req as Request, res as Response, next)

    assert((next as sinon.SinonStub).calledOnce)
    assert((next as sinon.SinonStub).calledWith())

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
})
