// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import type { ConversationReference } from '@microsoft/agents-activity'
import { TestAdapter } from '../../testStubs'
import { TurnContext } from '../../../../src/turnContext'
import { Conversation, ConversationClaims } from '../../../../src/app/proactive/conversation'

const makeReference = (): ConversationReference => ({
  conversation: { id: 'conv-1', isGroup: false },
  serviceUrl: 'https://example.com',
  channelId: 'webchat',
  user: { id: 'user-1', name: 'User' },
  agent: { id: 'bot-1', name: 'Bot' }
})

const makeClaims = (): ConversationClaims => ({
  aud: 'bot-app-id',
  tid: 'tenant-1'
})

const makeTurnContext = (): TurnContext => {
  const adapter = new TestAdapter()
  const activity = Activity.fromObject({
    type: 'message',
    from: { id: 'user-1', name: 'User' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat',
    recipient: { id: 'bot-1', name: 'Bot' },
    serviceUrl: 'https://example.com'
  })
  return new TurnContext(adapter, activity, { aud: 'bot-app-id', tid: 'tenant-1' })
}

describe('Conversation', () => {
  describe('constructor from TurnContext', () => {
    it('captures conversation reference from context activity', () => {
      const ctx = makeTurnContext()
      const conv = new Conversation(ctx)
      assert.equal(conv.reference.conversation.id, 'conv-1')
      assert.equal(conv.reference.serviceUrl, 'https://example.com')
      assert.equal(conv.reference.channelId, 'webchat')
    })

    it('captures claims from context.identity', () => {
      const ctx = makeTurnContext()
      const conv = new Conversation(ctx)
      assert.equal(conv.claims.aud, 'bot-app-id')
    })

    it('normalizes aud to a string when identity.aud is an array', () => {
      const adapter = new TestAdapter()
      const activity = Activity.fromObject({
        type: 'message',
        from: { id: 'user-1', name: 'User' },
        conversation: { id: 'conv-1' },
        channelId: 'webchat',
        recipient: { id: 'bot-1', name: 'Bot' },
        serviceUrl: 'https://example.com'
      })
      const ctx = new TurnContext(adapter, activity, { aud: ['bot-app-id', 'other-id'] } as any)
      const conv = new Conversation(ctx)
      assert.equal(typeof conv.claims.aud, 'string')
      assert.equal(conv.claims.aud, 'bot-app-id')
    })
  })

  describe('constructor from (claims, reference)', () => {
    it('stores reference and claims', () => {
      const ref = makeReference()
      const claims = makeClaims()
      const conv = new Conversation(claims, ref)
      assert.deepEqual(conv.reference, ref)
      assert.deepEqual(conv.claims, claims)
    })
  })

  describe('identity getter', () => {
    it('returns object with aud from claims', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      assert.equal(conv.identity.aud, 'bot-app-id')
    })

    it('returns object with tid from claims', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      assert.equal((conv.identity as any).tid, 'tenant-1')
    })
  })

  describe('validate()', () => {
    it('throws if reference.conversation.id is missing', () => {
      const ref = makeReference()
      ref.conversation.id = ''
      const conv = new Conversation(makeClaims(), ref)
      assert.throws(() => conv.validate(), /conversation\.id/)
    })

    it('throws if reference.serviceUrl is missing', () => {
      const ref = makeReference()
      ref.serviceUrl = ''
      const conv = new Conversation(makeClaims(), ref)
      assert.throws(() => conv.validate(), /serviceUrl/)
    })

    it('throws if claims.aud is missing', () => {
      const ref = makeReference()
      const claims = { ...makeClaims(), aud: '' }
      const conv = new Conversation(claims, ref)
      assert.throws(() => conv.validate(), /aud/)
    })

    it('passes when all required fields are present', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      assert.doesNotThrow(() => conv.validate())
    })
  })

  describe('JSON roundtrip', () => {
    it('reconstructs reference and claims after JSON.stringify/parse', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      const parsed = JSON.parse(JSON.stringify(conv))
      assert.deepEqual(parsed.reference, conv.reference)
      assert.deepEqual(parsed.claims, conv.claims)
    })
  })

  describe('toJson()', () => {
    it('returns a string that round-trips to reference and claims', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      const parsed = JSON.parse(conv.toJson())
      assert.deepEqual(parsed.reference, conv.reference)
      assert.deepEqual(parsed.claims, conv.claims)
    })

    it('does not include the identity getter in output', () => {
      const conv = new Conversation(makeClaims(), makeReference())
      const parsed = JSON.parse(conv.toJson())
      assert.equal(parsed.identity, undefined)
    })
  })
})
