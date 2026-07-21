/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { ActivityHandler } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '../src/createAgentRequestHandler'

describe('createAgentRequestHandler', () => {
  it('returns a function', () => {
    const handler = createAgentRequestHandler(new ActivityHandler())
    assert.strictEqual(typeof handler, 'function')
  })

  it('responds 401 when JWT middleware rejects request (no auth header, clientId set)', async () => {
    const fastify = Fastify()
    const handler = createAgentRequestHandler(new ActivityHandler(), { clientId: 'test-app-id' })
    fastify.post('/api/messages', handler)

    const res = await fastify.inject({
      method: 'POST',
      url: '/api/messages',
      payload: { type: 'message', text: 'hello' }
    })

    assert.strictEqual(res.statusCode, 401)
    await fastify.close()
  })

  it('reaches adapter.process when middleware allows anonymous auth (no clientId, dev)', async () => {
    const originalEnv = process.env.NODE_ENV
    delete process.env.NODE_ENV
    const fastify = Fastify()
    const handler = createAgentRequestHandler(new ActivityHandler(), {})
    fastify.post('/api/messages', handler)

    // No body -> CloudAdapter.process throws TypeError, which Fastify maps to 500
    const res = await fastify.inject({
      method: 'POST',
      url: '/api/messages',
      payload: ''
    })

    assert.strictEqual(res.statusCode, 500)
    await fastify.close()
    if (originalEnv !== undefined) process.env.NODE_ENV = originalEnv
  })
})
