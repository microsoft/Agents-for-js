/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import type { AddressInfo } from 'node:net'
import { ActivityHandler } from '@microsoft/agents-hosting'
import { startServer } from '../src/startServer'
import type { FastifyInstance } from 'fastify'

const TEST_AUTH_CONFIG = { clientId: 'test-app-id' }

describe('startServer', () => {
  let fastify: FastifyInstance
  let port: number
  let beforeListenCalled = false

  before(async () => {
    fastify = await startServer(new ActivityHandler(), {
      authConfig: TEST_AUTH_CONFIG,
      port: 0,
      routePath: '/custom/messages',
      beforeListen: async (instance) => {
        beforeListenCalled = true
        instance.get('/health', async () => ({ status: 'ok' }))
      }
    })
    const addr = fastify.server.address() as AddressInfo
    port = addr.port
  })

  after(async () => {
    if (fastify) await fastify.close()
  })

  it('invokes beforeListen and does not require JWT for custom routes', async () => {
    assert.strictEqual(beforeListenCalled, true)
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    assert.strictEqual(res.status, 200)
    const body = await res.json() as { status: string }
    assert.strictEqual(body.status, 'ok')
  })

  it('honors routePath and requires JWT for the configured messages route', async () => {
    const protectedRes = await fetch(`http://127.0.0.1:${port}/custom/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hello' })
    })
    assert.strictEqual(protectedRes.status, 401)
    const defaultRouteRes = await fetch(`http://127.0.0.1:${port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hello' })
    })
    assert.strictEqual(defaultRouteRes.status, 404)
  })
})

describe('startServer with rate limit', () => {
  let fastify: FastifyInstance
  let port: number

  before(async () => {
    fastify = await startServer(new ActivityHandler(), {
      authConfig: TEST_AUTH_CONFIG,
      port: 0,
      rateLimit: {
        timeWindow: '1 minute',
        max: 2
      },
      beforeListen: async (instance) => {
        instance.get('/health', async () => ({ status: 'ok' }))
      }
    })
    const addr = fastify.server.address() as AddressInfo
    port = addr.port
  })

  after(async () => {
    if (fastify) await fastify.close()
  })

  it('enforces rate limit after configured max requests', async () => {
    const hit = async () => await fetch(`http://127.0.0.1:${port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'message', text: 'hello' })
    })
    const first = await hit()
    const second = await hit()
    const third = await hit()
    // First two should hit JWT (401) — rate limiter allows them.
    assert.strictEqual(first.status, 401)
    assert.strictEqual(second.status, 401)
    // Third should be 429 from @fastify/rate-limit.
    assert.strictEqual(third.status, 429)
  })

  it('does NOT throttle user-registered routes (scope = messages route only)', async () => {
    // Even after the messages route is rate-limited (above), /health remains unaffected.
    const responses = await Promise.all(
      Array.from({ length: 10 }, async () => await fetch(`http://127.0.0.1:${port}/health`))
    )
    for (const res of responses) {
      assert.strictEqual(res.status, 200, '/health must not be throttled by the messages rate limit')
    }
  })
})
