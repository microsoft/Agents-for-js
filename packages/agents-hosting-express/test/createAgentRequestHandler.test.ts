/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { before, describe, it } from 'node:test'
import assert from 'assert'
import { ActivityHandler, AgentApplication, CloudAdapter, type Request } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '../src/createAgentRequestHandler'
import { type WebResponse } from '../src/createAgentRequestHandler'
import { createCloudAdapter } from '../src/createCloudAdapter'
import {
  createContextAuthenticatedAgent,
  createScopedConfigurationContext,
  preloadAnonymousGlobalConfiguration
} from './configurationContext.fixture'

describe('createAgentRequestHandler', () => {
  before(preloadAnonymousGlobalConfiguration)

  const createMockResponse = (): WebResponse & { statusCode?: number, body?: unknown } => {
    return {
      headersSent: false,
      statusCode: undefined,
      body: undefined,
      status (code: number) {
        this.statusCode = code
        return this
      },
      setHeader (_name: string, _value: string) {
        return this
      },
      send (body?: unknown) {
        this.body = body
        this.headersSent = true
        return this
      },
      end () {
        this.headersSent = true
        return this
      }
    }
  }

  it('should complete without hanging when JWT middleware rejects request', async () => {
    const handler = createAgentRequestHandler(new ActivityHandler(), { clientId: 'test-app-id' })
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await assert.doesNotReject(async () => {
      await Promise.race([
        handler(req, res),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('handler timed out')), 1000))
      ])
    })

    assert.strictEqual(res.statusCode, 401)
    assert.strictEqual(res.headersSent, true)
  })

  it('should reach adapter.process when middleware allows anonymous auth', async () => {
    const handler = createAgentRequestHandler(new ActivityHandler(), {})
    const req: Request = {
      method: 'POST',
      headers: {}
    }
    const res = createMockResponse()

    await assert.rejects(async () => {
      await handler(req, res)
    }, (error: any) => {
      return error instanceof TypeError
    })

    assert.strictEqual(res.statusCode, undefined)
    assert.strictEqual(res.headersSent, false)
  })

  it('should return a function', () => {
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
    const adapter = new CloudAdapter({})
    let adapterAuthorizationCalls = 0
    const adapterAuthorizeRequest = adapter.authorizeRequest.bind(adapter)
    adapter.authorizeRequest = async (...args) => {
      adapterAuthorizationCalls++
      await adapterAuthorizeRequest(...args)
    }
    const app = new AgentApplication({ adapter })
    const handler = createAgentRequestHandler(app, { clientId: 'host-client-id' })
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await handler(req, res)

    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { 'jwt-auth-error': 'authorization header not found' })
    assert.strictEqual(adapterAuthorizationCalls, 0)
  })

  it('retains environment auth acceptance while processing with the application adapter', async () => {
    const adapter = new CloudAdapter({ clientId: 'adapter-client-id' })
    let processed = false
    adapter.process = async () => {
      processed = true
    }
    const handler = createAgentRequestHandler(new AgentApplication({ adapter }))
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await handler(req, res)

    assert.strictEqual(processed, true)
  })

  it('uses helper-scoped auth independently from the reused application adapter', async () => {
    const configurationContext = await createScopedConfigurationContext()
    const app = new AgentApplication({ adapter: new CloudAdapter({}) })
    const handler = createAgentRequestHandler(app, undefined, { configurationContext })
    const req: Request = { method: 'POST', headers: {} }
    const res = createMockResponse()

    await handler(req, res)
    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { 'jwt-auth-error': 'authorization header not found' })
  })

  it('uses scoped JWT auth instead of globally preloaded anonymous auth', async () => {
    const handler = createAgentRequestHandler(await createContextAuthenticatedAgent())
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await handler(req, res)

    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { 'jwt-auth-error': 'authorization header not found' })
  })

  it('uses scoped JWT auth for a plain ActivityHandler instead of globally preloaded anonymous auth', async () => {
    const configurationContext = await createScopedConfigurationContext()
    const handler = createAgentRequestHandler(new ActivityHandler(), undefined, { configurationContext })
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await handler(req, res)

    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { 'jwt-auth-error': 'authorization header not found' })
  })
})
