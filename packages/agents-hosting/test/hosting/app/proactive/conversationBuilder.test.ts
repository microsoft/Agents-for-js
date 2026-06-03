// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { TestAdapter } from '../../testStubs'
import { TurnContext } from '../../../../src/turnContext'
import { ConversationBuilder } from '../../../../src/app/proactive/conversationBuilder'
import { TeamsServiceEndpoints } from '../../../../src/app/proactive/conversationReferenceBuilder'

const makeTurnContext = (): TurnContext => {
  const adapter = new TestAdapter()
  const activity = Activity.fromObject({
    type: 'message',
    from: { id: 'user-1', name: 'User' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat',
    recipient: { id: 'bot-1', name: 'Bot' },
    serviceUrl: 'https://webchat.botframework.com/'
  })
  return new TurnContext(adapter, activity, { aud: 'bot-app-id' })
}

describe('ConversationBuilder', () => {
  describe('create()', () => {
    it('produces a Conversation with claims.aud set to agentClientId', () => {
      const conv = ConversationBuilder.create('my-client-id', 'webchat').withConversationId('conv-1').build()
      assert.equal(conv.claims.aud, 'my-client-id')
    })

    it('sets channelId on the reference', () => {
      const conv = ConversationBuilder.create('my-client-id', 'msteams').withConversationId('conv-1').build()
      assert.equal(conv.reference.channelId, 'msteams')
    })
  })

  describe('fromContext()', () => {
    it('captures conversation reference from context', () => {
      const ctx = makeTurnContext()
      const conv = ConversationBuilder.fromContext(ctx).build()
      assert.equal(conv.reference.conversation.id, 'conv-1')
      assert.equal(conv.reference.channelId, 'webchat')
    })

    it('captures claims from context.identity', () => {
      const ctx = makeTurnContext()
      const conv = ConversationBuilder.fromContext(ctx).build()
      assert.equal(conv.claims.aud, 'bot-app-id')
    })
  })

  describe('fluent chaining', () => {
    it('withUser().withConversationId().build() produces expected shape', () => {
      const conv = ConversationBuilder.create('client-id', 'webchat')
        .withUser('user-42', 'Bob')
        .withConversationId('conv-42')
        .build()
      assert.equal(conv.reference.user?.id, 'user-42')
      assert.equal(conv.reference.user?.name, 'Bob')
      assert.equal(conv.reference.conversation.id, 'conv-42')
    })
  })

  describe('withReference()', () => {
    it('merges partial reference into existing reference rather than replacing it', () => {
      const conv = ConversationBuilder.create('client-id', 'webchat')
        .withUser('user-1')
        .withReference({ conversation: { id: 'merged-conv', isGroup: false } })
        .build()
      // user should still be set from withUser
      assert.equal(conv.reference.user?.id, 'user-1')
      // conversation id should come from withReference
      assert.equal(conv.reference.conversation.id, 'merged-conv')
    })
  })

  describe('build()', () => {
    it('auto-fills serviceUrl from serviceUrlForChannel() when not set', () => {
      const conv = ConversationBuilder.create('client-id', 'msteams').withConversationId('conv-1').build()
      assert.equal(conv.reference.serviceUrl, TeamsServiceEndpoints.publicGlobal)
    })

    it('preserves a caller-supplied serviceUrl', () => {
      const conv = ConversationBuilder.create('client-id', 'msteams', 'https://custom.url/').withConversationId('conv-1').build()
      assert.equal(conv.reference.serviceUrl, 'https://custom.url/')
    })

    it('throws if claims.aud is missing', () => {
      // create() with empty string agentClientId means aud will be empty
      assert.throws(
        () => ConversationBuilder.create('', 'webchat').withConversationId('c1').build(),
        /aud/
      )
    })

    it('throws if conversation.id is missing', () => {
      assert.throws(
        () => ConversationBuilder.create('client-id', 'webchat').build(),
        /conversation\.id/
      )
    })

    it('throws if serviceUrl cannot be resolved (empty channelId)', () => {
      assert.throws(
        () => ConversationBuilder.create('client-id', '').withConversationId('c1').build(),
        /serviceUrl/
      )
    })
  })
})
