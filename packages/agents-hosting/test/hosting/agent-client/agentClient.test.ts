/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import sinon from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import {
  AgentClient,
  AuthConfiguration,
  CloudAdapter,
  ConversationState,
  MemoryStorage,
  MsalTokenProvider,
  TurnContext
} from '../../../src'

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

describe('AgentClient conversation ownership', () => {
  afterEach(() => {
    sinon.restore()
    delete process.env.DELEGATED_AGENT_endpoint
    delete process.env.DELEGATED_AGENT_clientId
    delete process.env.DELEGATED_AGENT_serviceUrl
  })

  it('stores the delegated agent client ID with the conversation reference', async () => {
    process.env.DELEGATED_AGENT_endpoint = 'https://delegated.example.test/api/messages'
    process.env.DELEGATED_AGENT_clientId = 'delegated-agent-client-id'
    process.env.DELEGATED_AGENT_serviceUrl = 'https://delegated.example.test'

    sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('valid-token')
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(undefined, { status: 200, statusText: 'OK' }))

    const authConfig = makeAuthConfig()
    const adapter = new CloudAdapter(authConfig)
    const activity = Activity.fromObject({
      type: 'message',
      channelId: 'test',
      serviceUrl: 'https://host.example.test',
      conversation: { id: 'root-conversation' },
      from: { id: 'user' },
      recipient: { id: 'host' },
      text: 'delegate this'
    })
    const context = new TurnContext(adapter, activity, CloudAdapter.createIdentity('host-client-id'))
    const storage = new MemoryStorage()
    const conversationState = new ConversationState(storage)

    await new AgentClient('DELEGATED_AGENT').postActivity(activity, authConfig, conversationState, context)

    const request = fetchStub.firstCall.args[1]
    const headers = request?.headers as Record<string, string>
    const conversationId = headers['x-ms-conversation-id']
    const stored = await storage.read([`test/conversations/${conversationId}`])
    const state = stored[`test/conversations/${conversationId}`] as Record<string, {
      expectedAgentClientId?: string
    }>

    assert.strictEqual(state[conversationId].expectedAgentClientId, 'delegated-agent-client-id')
  })

  it('removes delegated conversation state when the outbound request fails', async () => {
    process.env.DELEGATED_AGENT_endpoint = 'https://delegated.example.test/api/messages'
    process.env.DELEGATED_AGENT_clientId = 'delegated-agent-client-id'
    process.env.DELEGATED_AGENT_serviceUrl = 'https://delegated.example.test'

    sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('valid-token')
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(undefined, { status: 500, statusText: 'Failed' }))

    const authConfig = makeAuthConfig()
    const adapter = new CloudAdapter(authConfig)
    const activity = Activity.fromObject({
      type: 'message',
      channelId: 'test',
      serviceUrl: 'https://host.example.test',
      conversation: { id: 'root-conversation' },
      from: { id: 'user' },
      recipient: { id: 'host' }
    })
    const context = new TurnContext(adapter, activity, CloudAdapter.createIdentity('host-client-id'))
    const memory: Record<string, string> = {}
    const storage = new MemoryStorage(memory)
    const conversationState = new ConversationState(storage)
    const rootState = conversationState.createProperty<string>('root')
    await rootState.set(context, 'preserved')
    await conversationState.saveChanges(context)

    await assert.rejects(
      new AgentClient('DELEGATED_AGENT').postActivity(activity, authConfig, conversationState, context)
    )

    const request = fetchStub.firstCall.args[1]
    const headers = request?.headers as Record<string, string>
    const conversationId = headers['x-ms-conversation-id']
    assert.deepStrictEqual(await storage.read([`test/conversations/${conversationId}`]), {})
    assert.strictEqual(await rootState.get(context), 'preserved')
    assert.deepStrictEqual(Object.keys(memory), ['test/conversations/root-conversation/'])
  })

  it('removes delegated state after a network failure without changing caller state', async () => {
    process.env.DELEGATED_AGENT_endpoint = 'https://delegated.example.test/api/messages'
    process.env.DELEGATED_AGENT_clientId = 'delegated-agent-client-id'
    process.env.DELEGATED_AGENT_serviceUrl = 'https://delegated.example.test'

    sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('valid-token')
    sinon.stub(globalThis, 'fetch').rejects(new Error('network failure'))

    const authConfig = makeAuthConfig()
    const adapter = new CloudAdapter(authConfig)
    const activity = Activity.fromObject({
      type: 'message',
      channelId: 'test',
      serviceUrl: 'https://host.example.test',
      conversation: { id: 'root-conversation' },
      from: { id: 'user' },
      recipient: { id: 'host' }
    })
    const context = new TurnContext(adapter, activity, CloudAdapter.createIdentity('host-client-id'))
    const memory: Record<string, string> = {}
    const storage = new MemoryStorage(memory)
    const conversationState = new ConversationState(storage)
    const rootState = conversationState.createProperty<string>('root')
    await rootState.set(context, 'preserved')
    await conversationState.saveChanges(context)

    await assert.rejects(
      new AgentClient('DELEGATED_AGENT').postActivity(activity, authConfig, conversationState, context),
      /network failure/
    )

    assert.strictEqual(await rootState.get(context), 'preserved')
    assert.deepStrictEqual(Object.keys(memory), ['test/conversations/root-conversation/'])
  })

  it('does not persist delegated state when token acquisition fails', async () => {
    process.env.DELEGATED_AGENT_endpoint = 'https://delegated.example.test/api/messages'
    process.env.DELEGATED_AGENT_clientId = 'delegated-agent-client-id'
    process.env.DELEGATED_AGENT_serviceUrl = 'https://delegated.example.test'

    sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').rejects(new Error('token failure'))
    const fetchStub = sinon.stub(globalThis, 'fetch')

    const authConfig = makeAuthConfig()
    const adapter = new CloudAdapter(authConfig)
    const activity = Activity.fromObject({
      type: 'message',
      channelId: 'test',
      serviceUrl: 'https://host.example.test',
      conversation: { id: 'root-conversation' },
      from: { id: 'user' },
      recipient: { id: 'host' }
    })
    const context = new TurnContext(adapter, activity, CloudAdapter.createIdentity('host-client-id'))
    const memory: Record<string, string> = {}
    const storage = new MemoryStorage(memory)
    const conversationState = new ConversationState(storage)
    const rootState = conversationState.createProperty<string>('root')
    await rootState.set(context, 'preserved')
    await conversationState.saveChanges(context)

    await assert.rejects(
      new AgentClient('DELEGATED_AGENT').postActivity(activity, authConfig, conversationState, context),
      /token failure/
    )

    assert.strictEqual(fetchStub.called, false)
    assert.strictEqual(await rootState.get(context), 'preserved')
    assert.deepStrictEqual(Object.keys(memory), ['test/conversations/root-conversation/'])
  })
})
