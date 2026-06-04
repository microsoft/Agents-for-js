/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { adaptReply, FastifyReplyAdapter } from '../src/replyAdapter'

interface FakeReply {
  sent: boolean
  statusCode?: number
  body?: unknown
  headers: Record<string, string>
  status (code: number): FakeReply
  header (name: string, value: string): FakeReply
  send (body?: unknown): FakeReply
}

const createFakeReply = (): FakeReply => {
  const reply: FakeReply = {
    sent: false,
    headers: {},
    status (code) { this.statusCode = code; return this },
    header (name, value) { this.headers[name] = value; return this },
    send (body) { this.body = body; this.sent = true; return this }
  }
  return reply
}

describe('adaptReply', () => {
  it('returns a FastifyReplyAdapter instance', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    assert.ok(adapter instanceof FastifyReplyAdapter)
  })

  it('status, setHeader, send, end are chainable', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    const result = adapter.status(200).setHeader('x', 'y').send({ ok: true })
    assert.strictEqual(result, adapter)
    assert.strictEqual(reply.statusCode, 200)
    assert.strictEqual(reply.headers.x, 'y')
    assert.deepStrictEqual(reply.body, { ok: true })
  })

  it('headersSent and writableEnded both reflect reply.sent', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    assert.strictEqual(adapter.headersSent, false)
    assert.strictEqual(adapter.writableEnded, false)
    adapter.send('body')
    assert.strictEqual(adapter.headersSent, true)
    assert.strictEqual(adapter.writableEnded, true)
  })

  it('send is a no-op after reply.sent becomes true', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    adapter.send('first')
    adapter.send('second')
    assert.strictEqual(reply.body, 'first')
  })

  it('end is a no-op after reply.sent becomes true', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    adapter.send('only-body')
    adapter.end()
    assert.strictEqual(reply.body, 'only-body')
  })

  it('end calls reply.send() once when not yet sent', () => {
    const reply = createFakeReply()
    const adapter = adaptReply(reply as any)
    adapter.end()
    assert.strictEqual(reply.sent, true)
    assert.strictEqual(reply.body, undefined)
  })
})
