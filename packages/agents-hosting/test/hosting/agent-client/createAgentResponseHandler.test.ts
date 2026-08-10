/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Regression test for the createAgentResponseHandler missing-body guard:
 * a request without a parsed body must surface a stable MissingRequestBody
 * AgentError (matching CloudAdapter.process) rather than an opaque error from
 * deep inside normalizeIncomingActivity / Activity.fromObject.
 */

import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import sinon from 'sinon'
import jwt from 'jsonwebtoken'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import {
  ActivityHandler,
  AuthConfiguration,
  CloudAdapter,
  ConversationState,
  MemoryStorage,
  createAgentResponseHandler,
  HostingErrors,
  Request,
  TurnContext,
  WebResponse
} from '../../../src'

const makeRes = (): WebResponse => {
  const r: any = {
    headersSent: false,
    writableEnded: false,
    statusCode: undefined,
    body: undefined,
    status (code: number) { r.statusCode = code; return r },
    setHeader () { return r },
    send (body: unknown) { r.body = body; r.headersSent = true; return r },
    end () { r.writableEnded = true; return r }
  }
  return r
}

const makeAuthConfig = (): AuthConfiguration => {
  const connection = {
    clientId: 'host-client-id',
    tenantId: 'tenant-id',
    issuers: ['https://api.botframework.com']
  }
  const alternateConnection = {
    clientId: 'alternate-host-client-id',
    tenantId: 'tenant-id',
    issuers: ['https://api.botframework.com']
  }
  return {
    ...connection,
    connections: new Map([
      ['serviceConnection', connection],
      ['alternateConnection', alternateConnection]
    ]),
    connectionsMap: [
      { connection: 'serviceConnection', serviceUrl: '*' },
      { connection: 'alternateConnection', serviceUrl: 'https://alternate.example.test' }
    ]
  }
}

const makeHandler = (agent = new ActivityHandler(), conversationState = new ConversationState(new MemoryStorage())) => {
  const authConfig = makeAuthConfig()
  const adapter = new CloudAdapter(authConfig)
  return {
    handler: createAgentResponseHandler(adapter, agent, conversationState),
    adapter
  }
}

const stubValidJwt = (callerClientId: string, audience: string | string[] = 'host-client-id') => {
  sinon.stub(jwt, 'decode').returns({
    aud: audience,
    iss: 'https://api.botframework.com'
  })
  sinon.stub(jwt, 'verify').callsFake((token, secretOrPublicKey, options, callback) => {
    if (callback) {
      callback(null, { aud: audience, azp: callerClientId })
    }
  })
}

const makeRequest = (body?: Record<string, unknown>): Request => ({
  headers: { authorization: ['Bear', 'er valid-token'].join('') },
  method: 'POST',
  body
})

const conversationReference = {
  activityId: 'root-activity',
  user: { id: 'user' },
  bot: { id: 'host' },
  conversation: { id: 'root-conversation' },
  channelId: 'test',
  serviceUrl: 'https://example.test'
}

const seedConversation = async (storage: MemoryStorage, expectedAgentClientId?: string) => {
  await storage.write({
    'test/conversations/c1': {
      c1: {
        conversationReference,
        nameRequested: false,
        expectedAgentClientId
      }
    }
  })
}

describe('createAgentResponseHandler authentication', () => {
  beforeEach(() => {
    sinon.restore()
  })

  afterEach(() => {
    sinon.restore()
  })

  it('returns 401 before processing a request without credentials', async () => {
    const { handler } = makeHandler()
    const res = makeRes() as WebResponse & { statusCode?: number, body?: unknown }

    await handler({ headers: {}, method: 'POST', body: { type: 'message' } }, res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 401)
    assert.deepStrictEqual(res.body, { 'jwt-auth-error': 'authorization header not found' })
  })

  it('returns 403 without invoking agent logic when the caller does not own the conversation', async () => {
    stubValidJwt('attacker-client-id')
    const storage = new MemoryStorage()
    await seedConversation(storage, 'delegated-agent-client-id')
    const conversationState = new ConversationState(storage)
    let invoked = false
    const agent = new ActivityHandler()
    agent.onEndOfConversation(async (_context, next) => {
      invoked = true
      await next()
    })
    const { handler } = makeHandler(agent, conversationState)
    const res = makeRes() as WebResponse & { statusCode?: number, body?: unknown }

    await handler(makeRequest({
      type: ActivityTypes.EndOfConversation,
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 403)
    assert.deepStrictEqual(res.body, { 'agent-response-auth-error': 'caller is not authorized for this conversation' })
    assert.strictEqual(invoked, false)
    const stored = await storage.read(['test/conversations/c1'])
    assert.strictEqual((stored['test/conversations/c1'] as any).c1.expectedAgentClientId, 'delegated-agent-client-id')
  })

  it('continues with the host audience selected during adapter authorization', async () => {
    stubValidJwt('delegated-agent-client-id', ['unrelated-audience', 'alternate-host-client-id'])
    const storage = new MemoryStorage()
    await seedConversation(storage, 'delegated-agent-client-id')
    const { handler, adapter } = makeHandler(new ActivityHandler(), new ConversationState(storage))
    const sendActivity = sinon.stub(TurnContext.prototype, 'sendActivity').resolves({ id: 'response' })
    sinon.stub(adapter, 'continueConversation').callsFake(async (...args: any[]) => {
      assert.strictEqual(args[0].aud, 'alternate-host-client-id')
      const callback = args[2]
      const context = new TurnContext(adapter, Activity.fromObject({
        type: 'event',
        channelId: 'test',
        serviceUrl: 'https://example.test',
        conversation: { id: 'root-conversation' },
        from: { id: 'user' },
        recipient: { id: 'host' }
      }), CloudAdapter.createIdentity('host-client-id'))
      await callback(context)
    })
    const res = makeRes() as WebResponse & { statusCode?: number }

    await handler(makeRequest({
      type: 'message',
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(sendActivity.calledOnce, true)
  })

  it('returns 403 for legacy conversation state without an expected agent client ID', async () => {
    stubValidJwt('delegated-agent-client-id')
    const storage = new MemoryStorage()
    await seedConversation(storage)
    const warning = sinon.stub(console, 'warn')
    const { handler } = makeHandler(new ActivityHandler(), new ConversationState(storage))
    const res = makeRes() as WebResponse & { statusCode?: number }

    await handler(makeRequest({
      type: 'message',
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(warning.called, false)
  })

  it('returns 403 for missing conversation state without reporting it as legacy', async () => {
    stubValidJwt('delegated-agent-client-id')
    const warning = sinon.stub(console, 'warn')
    const { handler } = makeHandler()
    const res = makeRes() as WebResponse & { statusCode?: number }

    await handler(makeRequest({
      type: 'message',
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 403)
    assert.strictEqual(warning.called, false)
  })

  it('returns 403 for malformed conversation state', async () => {
    stubValidJwt('delegated-agent-client-id')
    const storage = new MemoryStorage()
    await storage.write({
      'test/conversations/c1': {
        c1: {
          expectedAgentClientId: 'delegated-agent-client-id'
        }
      }
    })
    const { handler } = makeHandler(new ActivityHandler(), new ConversationState(storage))
    const res = makeRes() as WebResponse & { statusCode?: number }

    await handler(makeRequest({
      type: 'message',
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 403)
  })

  it('processes the callback when the authenticated caller owns the conversation', async () => {
    stubValidJwt('DELEGATED-AGENT-CLIENT-ID')
    const storage = new MemoryStorage()
    await seedConversation(storage, 'delegated-agent-client-id')
    let invoked = false
    const agent = new ActivityHandler()
    agent.onEndOfConversation(async (_context, next) => {
      invoked = true
      await next()
    })
    const { handler, adapter } = makeHandler(agent, new ConversationState(storage))
    sinon.stub(adapter, 'continueConversation').callsFake(async (...args: any[]) => {
      const callback = args[2]
      const context = new TurnContext(adapter, Activity.fromObject({
        type: 'event',
        channelId: 'test',
        serviceUrl: 'https://example.test',
        conversation: { id: 'root-conversation' },
        from: { id: 'user' },
        recipient: { id: 'host' }
      }), CloudAdapter.createIdentity('host-client-id'))
      await callback(context)
    })
    const res = makeRes() as WebResponse & { statusCode?: number }

    await handler(makeRequest({
      type: ActivityTypes.EndOfConversation,
      channelId: 'test',
      conversation: { id: 'c1' }
    }), res, { conversationId: 'c1', activityId: 'a1' })

    assert.strictEqual(res.statusCode, 200)
    assert.strictEqual(invoked, true)
    assert.deepStrictEqual(await storage.read(['test/conversations/c1']), {})
  })

  it('preserves anonymous callbacks outside production and emits a startup warning', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const storage = new MemoryStorage()
    await seedConversation(storage, 'delegated-agent-client-id')
    const { adapter } = makeHandler(new ActivityHandler(), new ConversationState(storage))
    sinon.stub(adapter, 'getClientId').returns(undefined)
    sinon.stub(adapter, 'authorizeRequest').callsFake(async (req, _res, next) => {
      req.user = { name: 'anonymous' }
      next()
    })
    const warning = sinon.stub(console, 'warn')
    const handler = createAgentResponseHandler(adapter, new ActivityHandler(), new ConversationState(storage))
    createAgentResponseHandler(adapter, new ActivityHandler(), new ConversationState(storage))
    assert.strictEqual(warning.callCount, 2)
    const sendActivity = sinon.stub(TurnContext.prototype, 'sendActivity').resolves({ id: 'response' })
    sinon.stub(adapter, 'continueConversation').callsFake(async (...args: any[]) => {
      const callback = args[2]
      const context = new TurnContext(adapter, Activity.fromObject({
        type: 'event',
        channelId: 'test',
        serviceUrl: 'https://example.test',
        conversation: { id: 'root-conversation' },
        from: { id: 'user' },
        recipient: { id: 'host' }
      }), CloudAdapter.createIdentity(''))
      await callback(context)
    })
    const res = makeRes() as WebResponse & { statusCode?: number }

    try {
      await handler({
        headers: {},
        method: 'POST',
        body: {
          type: 'message',
          channelId: 'test',
          conversation: { id: 'c1' }
        }
      }, res, { conversationId: 'c1', activityId: 'a1' })

      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(sendActivity.calledOnce, true)
      assert(warning.calledWithMatch('anonymous authentication outside production'))
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }
  })

  it('rejects anonymous callbacks in production', async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const storage = new MemoryStorage()
    await seedConversation(storage, 'delegated-agent-client-id')
    const { adapter } = makeHandler(new ActivityHandler(), new ConversationState(storage))
    sinon.stub(adapter, 'getClientId').returns(undefined)
    sinon.stub(adapter, 'authorizeRequest').callsFake(async (req, _res, next) => {
      req.user = { name: 'anonymous' }
      next()
    })
    const warning = sinon.stub(console, 'warn')
    let continued = false
    sinon.stub(adapter, 'continueConversation').callsFake(async () => {
      continued = true
    })
    const handler = createAgentResponseHandler(adapter, new ActivityHandler(), new ConversationState(storage))
    const res = makeRes() as WebResponse & { statusCode?: number }

    try {
      await handler({
        headers: {},
        method: 'POST',
        body: {
          type: 'message',
          channelId: 'test',
          conversation: { id: 'c1' }
        }
      }, res, { conversationId: 'c1', activityId: 'a1' })

      assert.strictEqual(res.statusCode, 403)
      assert.strictEqual(continued, false)
      assert.strictEqual(warning.called, false)
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV
      } else {
        process.env.NODE_ENV = originalNodeEnv
      }
    }
  })
})

describe('createAgentResponseHandler missing-body guard', () => {
  beforeEach(() => {
    stubValidJwt('delegated-agent-client-id')
  })

  afterEach(() => {
    sinon.restore()
  })

  const makeMissingBodyHandler = () => {
    const { handler } = makeHandler()
    return handler
  }

  const params = { conversationId: 'c1', activityId: 'a1' }

  it('throws MissingRequestBody when req.body is undefined', async () => {
    const handler = makeMissingBodyHandler()
    await assert.rejects(
      () => handler(makeRequest(), makeRes(), params),
      (err: any) => {
        assert.strictEqual(err.code, HostingErrors.MissingRequestBody.code)
        return true
      }
    )
  })

  it('throws MissingRequestBody when req.body is null', async () => {
    const handler = makeMissingBodyHandler()
    await assert.rejects(
      () => handler({ ...makeRequest(), body: null } as unknown as Request, makeRes(), params),
      (err: any) => {
        assert.strictEqual(err.code, HostingErrors.MissingRequestBody.code)
        return true
      }
    )
  })
})
