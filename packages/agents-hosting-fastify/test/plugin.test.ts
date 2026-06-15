/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { ActivityHandler } from '@microsoft/agents-hosting'
import agentsPlugin from '../src/plugin'

describe('agentsHostingFastifyPlugin', () => {
  it('registers POST /api/messages by default', async () => {
    const fastify = Fastify()
    await fastify.register(agentsPlugin, {
      agent: new ActivityHandler(),
      authConfig: { clientId: 'test-app-id' }
    })
    const res = await fastify.inject({ method: 'POST', url: '/api/messages', payload: { type: 'message' } })
    // 401 means the route exists and JWT middleware ran.
    assert.strictEqual(res.statusCode, 401)
    await fastify.close()
  })

  it('respects custom routePath', async () => {
    const fastify = Fastify()
    await fastify.register(agentsPlugin, {
      agent: new ActivityHandler(),
      authConfig: { clientId: 'test-app-id' },
      routePath: '/bot/in'
    })
    const wrong = await fastify.inject({ method: 'POST', url: '/api/messages', payload: {} })
    const right = await fastify.inject({ method: 'POST', url: '/bot/in', payload: { type: 'message' } })
    assert.strictEqual(wrong.statusCode, 404)
    assert.strictEqual(right.statusCode, 401)
    await fastify.close()
  })

  it('does not clobber existing decorators on the instance', async () => {
    const fastify = Fastify()
    fastify.decorate('foo', 'bar')
    await fastify.register(agentsPlugin, {
      agent: new ActivityHandler(),
      authConfig: { clientId: 'test-app-id' }
    })
    assert.strictEqual((fastify as any).foo, 'bar')
    await fastify.close()
  })

  it('can be registered with a prefix', async () => {
    const fastify = Fastify()
    await fastify.register(agentsPlugin, {
      agent: new ActivityHandler(),
      authConfig: { clientId: 'test-app-id' },
      prefix: '/v1'
    } as any)
    const prefixed = await fastify.inject({ method: 'POST', url: '/v1/api/messages', payload: { type: 'message' } })
    assert.strictEqual(prefixed.statusCode, 401)
    const unprefixed = await fastify.inject({ method: 'POST', url: '/api/messages', payload: { type: 'message' } })
    assert.strictEqual(unprefixed.statusCode, 404)
    await fastify.close()
  })
})
