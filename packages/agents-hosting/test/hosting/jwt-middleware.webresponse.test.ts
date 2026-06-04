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
    try {
      const middleware = authorizeJWT({
        tenantId: 't',
        clientId: '',
        issuers: [],
        connections: new Map()
      } as AuthConfiguration)
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
})
