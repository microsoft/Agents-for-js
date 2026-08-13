/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Phase 2 regression test: proves that authorizeJWT operates against the
 * framework-agnostic WebResponse / NextFunction contracts without importing
 * any Express types. This validates the WebResponse promotion does not require
 * Express to be present for the hosting layer to function.
 */

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { authorizeJWT, AuthConfiguration, WebResponse, NextFunction, Request } from '../../src'

const makeRes = (): WebResponse & { _status?: number, _body?: unknown } => {
  const r: any = {
    headersSent: false,
    writableEnded: false,
    status (code: number) { r._status = code; return r },
    setHeader (_n: string, _v: string) { return r },
    send (body?: unknown) { r._body = body; r.headersSent = true; return r },
    end () { r.writableEnded = true; return r }
  }
  return r
}

describe('authorizeJWT (WebResponse contract)', () => {
  const authConfig: AuthConfiguration = {
    tenantId: 'tenant-id',
    clientId: 'client-id',
    issuers: ['issuer'],
    connections: new Map<string, AuthConfiguration>([['default', {
      clientId: 'client-id',
      tenantId: 'tenant-id',
      issuers: ['issuer'],
      authority: 'http://login.microsoftonline.com'
    }]])
  }

  it('rejects DELETE with 405 against a plain WebResponse', async () => {
    const middleware = authorizeJWT(authConfig)
    const req: Request = { method: 'DELETE', headers: {} }
    const res = makeRes()
    let nextCalled = false
    const next: NextFunction = () => { nextCalled = true }

    await middleware(req, res, next)

    assert.strictEqual(res._status, 405)
    assert.strictEqual(nextCalled, false, 'next should not be invoked on 405')
  })

  it('rejects missing Authorization header with 401 in production-like config', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const middleware = authorizeJWT(authConfig)
      const req: Request = { method: 'POST', headers: {} }
      const res = makeRes()
      let nextCalled = false
      const next: NextFunction = () => { nextCalled = true }

      await middleware(req, res, next)

      assert.strictEqual(res._status, 401)
      assert.strictEqual(nextCalled, false)
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('allows anonymous request through when no clientId and not production', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const anonymousAuthConfig: AuthConfiguration = {
      tenantId: 't',
      clientId: '',
      issuers: [],
      connections: new Map()
    }
    try {
      const middleware = authorizeJWT(anonymousAuthConfig)
      const req: Request = { method: 'POST', headers: {} }
      const res = makeRes()
      let nextCalled = false
      const next: NextFunction = () => { nextCalled = true }

      await middleware(req, res, next)

      assert.strictEqual(nextCalled, true, 'anonymous fallback should call next')
      assert.strictEqual(res._status, undefined)
      assert.deepStrictEqual(req.user, { name: 'anonymous' })
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('rejects an array-valued malformed Authorization header with 401 (no throw)', async () => {
    const middleware = authorizeJWT(authConfig)
    // A non-Bearer array value previously reached `(value as string).split(...)`
    // and threw a TypeError before any 401 could be produced.
    const req: Request = { method: 'POST', headers: { authorization: ['Basic abc', 'Negotiate xyz'] } }
    const res = makeRes()
    let nextCalled = false
    const next: NextFunction = () => { nextCalled = true }

    await middleware(req, res, next)

    assert.strictEqual(res._status, 401)
    assert.strictEqual(nextCalled, false)
    assert.deepStrictEqual(res._body, { 'jwt-auth-error': 'invalid authorization header' })
  })

  it('rejects a non-Bearer scheme with 401 without attempting verification', async () => {
    const middleware = authorizeJWT(authConfig)
    const req: Request = { method: 'POST', headers: { authorization: 'Basic dXNlcjpwYXNz' } }
    const res = makeRes()
    let nextCalled = false
    const next: NextFunction = () => { nextCalled = true }

    await middleware(req, res, next)

    assert.strictEqual(res._status, 401)
    assert.strictEqual(nextCalled, false)
    assert.deepStrictEqual(res._body, { 'jwt-auth-error': 'invalid authorization header' })
  })

  it('rejects a Bearer header with no token as malformed (401)', async () => {
    const middleware = authorizeJWT(authConfig)
    const req: Request = { method: 'POST', headers: { authorization: 'Bearer' } }
    const res = makeRes()
    let nextCalled = false
    const next: NextFunction = () => { nextCalled = true }

    await middleware(req, res, next)

    assert.strictEqual(res._status, 401)
    assert.strictEqual(nextCalled, false)
    assert.deepStrictEqual(res._body, { 'jwt-auth-error': 'invalid authorization header' })
  })

  it('treats an empty-string Authorization header as absent (anonymous in dev)', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const anonymousAuthConfig: AuthConfiguration = {
      tenantId: 't',
      clientId: '',
      issuers: [],
      connections: new Map()
    }
    try {
      const middleware = authorizeJWT(anonymousAuthConfig)
      const req: Request = { method: 'POST', headers: { authorization: '' } }
      const res = makeRes()
      let nextCalled = false
      const next: NextFunction = () => { nextCalled = true }

      await middleware(req, res, next)

      assert.strictEqual(nextCalled, true, 'empty header should fall through to anonymous')
      assert.strictEqual(res._status, undefined)
      assert.deepStrictEqual(req.user, { name: 'anonymous' })
    } finally {
      process.env.NODE_ENV = prev
    }
  })
})
