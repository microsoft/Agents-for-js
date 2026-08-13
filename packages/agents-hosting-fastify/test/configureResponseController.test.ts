/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  ActivityHandler,
  AuthConfiguration,
  CloudAdapter,
  ConversationState,
  MemoryStorage,
  TurnContext
} from '@microsoft/agents-hosting'
import { configureResponseController } from '../src/configureResponseController'

const makeAuthConfig = (): AuthConfiguration => {
  const connection = {
    clientId: 'host-client-id',
    tenantId: 'tenant-id',
    issuers: ['https://api.botframework.com']
  }
  return {
    ...connection,
    connections: new Map([['serviceConnection', connection]]),
    connectionsMap: [{ connection: 'serviceConnection', serviceUrl: '*' }]
  }
}

const seedConversation = async (storage: MemoryStorage) => {
  await storage.write({
    'test/conversations/c1': {
      c1: {
        conversationReference: {
          activityId: 'root-activity',
          user: { id: 'user' },
          bot: { id: 'host' },
          conversation: { id: 'root-conversation' },
          channelId: 'test',
          serviceUrl: 'https://example.test'
        },
        nameRequested: false,
        expectedAgentClientId: 'delegated-agent-client-id'
      }
    }
  })
}

const createServer = async (
  callerClientId?: string
): Promise<{ fastify: FastifyInstance, adapter: CloudAdapter, storage: MemoryStorage, agent: ActivityHandler }> => {
  const fastify = Fastify()
  const adapter = new CloudAdapter(makeAuthConfig())
  const agent = new ActivityHandler()
  const storage = new MemoryStorage()
  await seedConversation(storage)
  sinon.stub(adapter, 'authorizeRequest').callsFake(async (req, res, next) => {
    if (!callerClientId) {
      res.status(401).send({ 'jwt-auth-error': 'authorization header not found' })
      return
    }
    req.user = { aud: 'host-client-id', azp: callerClientId }
    next()
  })
  configureResponseController(fastify, adapter, agent, new ConversationState(storage))
  await fastify.ready()
  return { fastify, adapter, storage, agent }
}

describe('configureResponseController (Fastify)', () => {
  let fastify: FastifyInstance | undefined

  afterEach(async () => {
    sinon.restore()
    if (fastify) {
      await fastify.close()
      fastify = undefined
    }
  })

  it('registers the canonical response route', async () => {
    ;({ fastify } = await createServer())
    assert.match(fastify.printRoutes({ commonPrefix: false }), /agentresponse/)
  })

  it('returns 401 when adapter authentication rejects the request', async () => {
    ;({ fastify } = await createServer())

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/agentresponse/v3/conversations/c1/activities/a1',
      payload: { type: 'message', channelId: 'test', conversation: { id: 'c1' } }
    })

    assert.strictEqual(response.statusCode, 401, response.body)
  })

  it('returns 403 when the authenticated caller does not own the conversation', async () => {
    ;({ fastify } = await createServer('different-agent-client-id'))

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/agentresponse/v3/conversations/c1/activities/a1',
      payload: { type: 'message', channelId: 'test', conversation: { id: 'c1' } }
    })

    assert.strictEqual(response.statusCode, 403, response.body)
  })

  it('processes an authorized EndOfConversation response and removes delegated state', async () => {
    let adapter: CloudAdapter
    let storage: MemoryStorage
    let agent: ActivityHandler
    ;({ fastify, adapter, storage, agent } = await createServer('delegated-agent-client-id'))
    sinon.stub(agent, 'run').resolves()
    sinon.stub(adapter, 'continueConversation').callsFake(async (...args: any[]) => {
      const callback = args[2]
      const context = { activity: {} } as TurnContext
      await callback(context)
    })

    const response = await fastify.inject({
      method: 'POST',
      url: '/api/agentresponse/v3/conversations/c1/activities/a1',
      payload: {
        type: 'endOfConversation',
        channelId: 'test',
        conversation: { id: 'c1' }
      }
    })

    assert.strictEqual(response.statusCode, 200, response.body)
    assert.strictEqual(response.headers['content-type'], 'text/plain; charset=utf-8')
    assert.deepStrictEqual(await storage.read(['test/conversations/c1']), {})
  })
})
