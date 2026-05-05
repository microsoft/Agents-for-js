// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import { SlackApi, SlackApiKey } from '../../src/api/slackApi.js'

describe('SlackApi', () => {
  let fetchStub: sinon.SinonStub

  beforeEach(() => {
    fetchStub = sinon.stub(globalThis, 'fetch' as any)
  })

  afterEach(() => {
    fetchStub.restore()
  })

  it('calls the correct Slack API URL with Bearer token', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ ok: true, ts: '123.456' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    const api = new SlackApi('xoxb-test-token')
    const result = await api.call('chat.postMessage', { channel: 'C123', text: 'hello' })

    assert.equal(result.ok, true)
    assert.equal(result.ts, '123.456')

    const [url, init] = fetchStub.firstCall.args as [string, RequestInit]
    assert.equal(url, 'https://slack.com/api/chat.postMessage')
    assert.equal((init.headers as Record<string, string>)['Authorization'], 'Bearer xoxb-test-token')
    assert.equal((init.headers as Record<string, string>)['Content-Type'], 'application/json')
    assert.equal(init.method, 'POST')

    const body = JSON.parse(init.body as string)
    assert.equal(body.channel, 'C123')
    assert.equal(body.text, 'hello')
  })

  it('omits null and undefined values from request body', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ ok: true }), { status: 200 }))

    const api = new SlackApi('token')
    await api.call('chat.postMessage', { channel: 'C123', text: null, optional: undefined, value: 42 })

    const body = JSON.parse(fetchStub.firstCall.args[1].body)
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'text'))
    assert.ok(!Object.prototype.hasOwnProperty.call(body, 'optional'))
    assert.equal(body.value, 42)
  })

  it('throws on HTTP error status', async () => {
    fetchStub.resolves(new Response('Service Unavailable', { status: 503 }))

    const api = new SlackApi('token')
    await assert.rejects(
      () => api.call('chat.postMessage', {}),
      (err: Error) => {
        assert.ok(err.message.includes('-160001'))
        return true
      }
    )
  })

  it('throws when Slack returns ok: false', async () => {
    fetchStub.resolves(new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), { status: 200 }))

    const api = new SlackApi('token')
    await assert.rejects(
      () => api.call('chat.postMessage', {}),
      (err: Error) => {
        assert.ok(err.message.includes('-160000'))
        return true
      }
    )
  })

  it('SlackApiKey is a unique symbol', () => {
    assert.equal(typeof SlackApiKey, 'symbol')
  })
})
