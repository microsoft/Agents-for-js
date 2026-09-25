/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { before, describe, it } from 'node:test'
import assert from 'node:assert'
import Fastify from 'fastify'
import { ActivityHandler, AgentApplication, CloudAdapter, createCloudAdapter } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '../src/createAgentRequestHandler'
import {
  createContextAuthenticatedAgent,
  createScopedConfigurationContext,
  preloadAnonymousGlobalConfiguration
} from './configurationContext.fixture'

describe('createAgentRequestHandler', () => {
  before(preloadAnonymousGlobalConfiguration)

  it('returns a function', () => {
    const handler = createAgentRequestHandler(new ActivityHandler())
    assert.strictEqual(typeof handler, 'function')
  })

  it('preserves explicit auth for an ActivityHandler without a context', () => {
    const activityHandlerAuth = createCloudAdapter(
      new ActivityHandler(),
      { clientId: 'activity-handler-client-id' }
    ).adapter.getClientId()

    assert.strictEqual(activityHandlerAuth, 'activity-handler-client-id')
  })

  it('preserves explicit host auth for an AgentApplication with an anonymous adapter', async () => {
    const fastify = Fastify()
    try {
      const adapter = new CloudAdapter({})
      let adapterAuthorizationCalls = 0
      const adapterAuthorizeRequest = adapter.authorizeRequest.bind(adapter)
      adapter.authorizeRequest = async (...args) => {
        adapterAuthorizationCalls++
        await adapterAuthorizeRequest(...args)
      }
      const app = new AgentApplication({ adapter })
      fastify.post(
        '/api/messages',
        createAgentRequestHandler(app, { clientId: 'host-client-id' })
      )

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message', text: 'hello' }
      })

      assert.strictEqual(res.statusCode, 401)
      assert.strictEqual(adapterAuthorizationCalls, 0)
    } finally {
      await fastify.close()
    }
  })

  it('retains environment auth acceptance while processing with the application adapter', async () => {
    const fastify = Fastify()
    try {
      const adapter = new CloudAdapter({ clientId: 'adapter-client-id' })
      let processed = false
      adapter.process = async () => {
        processed = true
      }
      fastify.post(
        '/api/messages',
        createAgentRequestHandler(new AgentApplication({ adapter }))
      )

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message', text: 'hello' }
      })

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(processed, true)
    } finally {
      await fastify.close()
    }
  })

  it('uses helper-scoped auth independently from the reused application adapter', async () => {
    const fastify = Fastify()
    try {
      const configurationContext = await createScopedConfigurationContext()
      const app = new AgentApplication({ adapter: new CloudAdapter({}) })
      const handler = createAgentRequestHandler(app, undefined, { configurationContext })
      fastify.post('/api/messages', handler)

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: ''
      })

      assert.strictEqual(res.statusCode, 401)
      assert.deepStrictEqual(res.json(), { 'jwt-auth-error': 'authorization header not found' })
    } finally {
      await fastify.close()
    }
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

  it('uses scoped JWT auth instead of globally preloaded anonymous auth', async () => {
    const fastify = Fastify()
    try {
      const handler = createAgentRequestHandler(await createContextAuthenticatedAgent())
      fastify.post('/api/messages', handler)

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message', text: 'hello' }
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
      const handler = createAgentRequestHandler(new ActivityHandler(), undefined, { configurationContext })
      fastify.post('/api/messages', handler)

      const res = await fastify.inject({
        method: 'POST',
        url: '/api/messages',
        payload: { type: 'message', text: 'hello' }
      })

      assert.strictEqual(res.statusCode, 401)
      assert.deepStrictEqual(res.json(), { 'jwt-auth-error': 'authorization header not found' })
    } finally {
      await fastify.close()
    }
  })
})
