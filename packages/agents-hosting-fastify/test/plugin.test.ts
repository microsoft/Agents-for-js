/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { before, describe, it } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { ActivityHandler, AgentApplication, CloudAdapter } from '@microsoft/agents-hosting'
import agentsPlugin from '../src/plugin'
import {
  createContextAuthenticatedAgent,
  createScopedConfigurationContext,
  preloadAnonymousGlobalConfiguration
} from './configurationContext.fixture'

describe('agentsHostingFastifyPlugin', () => {
  before(preloadAnonymousGlobalConfiguration)

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

  it('keeps explicit host auth independent from the application adapter', async () => {
    const fastify = Fastify()
    const adapter = new CloudAdapter({})
    let adapterAuthorizationCalls = 0
    const adapterAuthorizeRequest = adapter.authorizeRequest.bind(adapter)
    adapter.authorizeRequest = async (...args) => {
      adapterAuthorizationCalls++
      await adapterAuthorizeRequest(...args)
    }

    try {
      await fastify.register(agentsPlugin, {
        agent: new AgentApplication({ adapter }),
        authConfig: { clientId: 'host-client-id' }
      })

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message' }
      })

      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(adapterAuthorizationCalls, 0)
    } finally {
      await fastify.close()
    }
  })

  it('uses scoped JWT auth instead of globally preloaded anonymous auth', async () => {
    const fastify = Fastify()
    try {
      await fastify.register(agentsPlugin, {
        agent: await createContextAuthenticatedAgent()
      })

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message' }
      })

      assert.strictEqual(res.statusCode, 401)
      assert.deepStrictEqual(res.json(), { 'jwt-auth-error': 'authorization header not found' })
    } finally {
      await fastify.close()
    }
  })

  it('uses scoped JWT auth for a plain ActivityHandler instead of globally preloaded anonymous auth', async () => {
    const fastify = Fastify()
    try {
      const configurationContext = await createScopedConfigurationContext()
      await fastify.register(agentsPlugin, {
        agent: new ActivityHandler(),
        configurationContext
      })

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message' }
      })

      assert.strictEqual(res.statusCode, 401)
      assert.deepStrictEqual(res.json(), { 'jwt-auth-error': 'authorization header not found' })
    } finally {
      await fastify.close()
    }
  })
})
