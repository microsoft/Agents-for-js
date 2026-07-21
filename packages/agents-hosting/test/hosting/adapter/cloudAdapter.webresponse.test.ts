/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Phase 2 regression test: proves that CloudAdapter.process accepts a plain
 * WebResponse object (no Express types involved) and drives it to a successful
 * end-of-response. This validates that the WebResponse promotion frees the
 * hosting layer from any compile-time dependency on Express.
 */

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { CloudAdapter, WebResponse, Request, TurnContext } from '../../../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

const makeRes = (): WebResponse & { _status?: number, _body?: unknown, _headers: Record<string, string> } => {
  const r: any = {
    headersSent: false,
    writableEnded: false,
    _headers: {},
    status (code: number) { r._status = code; return r },
    setHeader (n: string, v: string) { r._headers[n] = v; return r },
    send (body?: unknown) { r._body = body; r.headersSent = true; return r },
    end () { r.writableEnded = true; return r }
  }
  return r
}

describe('CloudAdapter.process (WebResponse contract)', () => {
  it('processes a minimal Message activity against a plain WebResponse', async () => {
    const adapter = new CloudAdapter({
      tenantId: 't',
      clientId: '',
      issuers: [],
      connections: new Map()
    })

    const activity: Partial<Activity> = {
      type: ActivityTypes.Message,
      text: 'hello',
      from: { id: 'u', name: 'u', role: 'user' } as any,
      recipient: { id: 'b', name: 'b', role: 'bot' } as any,
      conversation: { id: 'c' } as any,
      channelId: 'emulator',
      serviceUrl: 'http://localhost:1234',
      id: 'a1'
    }

    const req: Request = {
      method: 'POST',
      headers: {},
      body: activity,
      user: { name: 'anonymous' }
    }
    const res = makeRes()

    let invoked = false
    await adapter.process(req, res, async (ctx: TurnContext) => {
      invoked = true
      assert.strictEqual(ctx.activity.text, 'hello')
    })

    assert.strictEqual(invoked, true, 'agent logic should be invoked')
    assert.strictEqual(res.writableEnded, true, 'response should be ended via end()')
    assert.strictEqual(res._status, 200, 'status should be 200 OK')
  })

  it('throws TypeError with AgentError shape when request.body is missing', async () => {
    const adapter = new CloudAdapter({
      tenantId: 't',
      clientId: '',
      issuers: [],
      connections: new Map()
    })
    const req: Request = { method: 'POST', headers: {}, user: { name: 'anonymous' } } as Request
    const res = makeRes()

    await assert.rejects(
      adapter.process(req, res, async () => {}),
      (err: any) => {
        assert.ok(err instanceof TypeError, 'should be a TypeError')
        assert.strictEqual(err.code, -120830, 'should expose MissingRequestBody AgentError code')
        assert.ok(typeof err.helpLink === 'string' && err.helpLink.length > 0, 'should expose helpLink')
        assert.ok(/request\.body/.test(err.message), 'message should reference request.body')
        return true
      }
    )
  })
})
