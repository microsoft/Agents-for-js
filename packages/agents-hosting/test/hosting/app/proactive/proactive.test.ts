// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import sinon from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import { MemoryStorage } from '../../../../src'
import { TestAdapter } from '../../testStubs'
import { TurnContext } from '../../../../src/turnContext'
import { TurnState } from '../../../../src/app/turnState'
import { AgentApplication } from '../../../../src/app'
import { Conversation } from '../../../../src/app/proactive/conversation'
import { Proactive } from '../../../../src/app/proactive/proactive'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeConversation = (): Conversation =>
  new Conversation(
    {
      conversation: { id: 'conv-1', isGroup: false },
      serviceUrl: 'https://example.com',
      channelId: 'webchat',
      user: { id: 'user-1', name: 'User' },
      agent: { id: 'bot-1', name: 'Bot' }
    },
    { aud: 'bot-app-id' }
  )

const makeTurnContext = (adapter: TestAdapter): TurnContext => {
  const activity = Activity.fromObject({
    type: 'message',
    from: { id: 'user-1', name: 'User' },
    conversation: { id: 'conv-1' },
    channelId: 'webchat',
    recipient: { id: 'bot-1', name: 'Bot' },
    serviceUrl: 'https://example.com'
  })
  return new TurnContext(adapter, activity, { aud: 'bot-app-id' })
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('Proactive', () => {
  let storage: MemoryStorage
  let adapter: TestAdapter
  let app: AgentApplication<TurnState>
  let proactive: Proactive<TurnState>

  beforeEach(() => {
    storage = new MemoryStorage()
    adapter = new TestAdapter()
    sinon.stub(adapter, 'continueConversation').callsFake(async (_identity, ref, logic) => {
      const act = Activity.getContinuationActivity(ref as any)
      const ctx = new TurnContext(adapter, act)
      await logic(ctx)
    })
    app = new AgentApplication({ storage, proactive: { storage } })
    proactive = app.proactive
  })

  // -------------------------------------------------------------------------
  // Storage operations
  // -------------------------------------------------------------------------

  describe('storeConversation(context)', () => {
    it('writes with key conversationreferences/{conversationId} and returns the id', async () => {
      const ctx = makeTurnContext(adapter)
      const id = await proactive.storeConversation(ctx)
      assert.equal(id, 'conv-1')
      const stored = await storage.read([`conversationreferences/conv-1`])
      assert.ok(stored[`conversationreferences/conv-1`])
    })
  })

  describe('storeConversation(conversation)', () => {
    it('stores an explicit Conversation and returns the conversation id', async () => {
      const conv = makeConversation()
      const id = await proactive.storeConversation(conv)
      assert.equal(id, 'conv-1')
      const stored = await storage.read([`conversationreferences/conv-1`])
      assert.ok(stored[`conversationreferences/conv-1`])
    })
  })

  describe('getConversation()', () => {
    it('returns the stored Conversation', async () => {
      await proactive.storeConversation(makeConversation())
      const conv = await proactive.getConversation('conv-1')
      assert.ok(conv)
      assert.equal(conv!.reference.conversation.id, 'conv-1')
      assert.equal(conv!.claims.aud, 'bot-app-id')
    })

    it('returns undefined when conversation is not found', async () => {
      const conv = await proactive.getConversation('does-not-exist')
      assert.equal(conv, undefined)
    })
  })

  describe('getConversationOrThrow()', () => {
    it('throws when the conversation is not in storage', async () => {
      await assert.rejects(() => proactive.getConversationOrThrow('missing-id'))
    })
  })

  describe('deleteConversation()', () => {
    it('removes the conversation so subsequent getConversation returns undefined', async () => {
      await proactive.storeConversation(makeConversation())
      await proactive.deleteConversation('conv-1')
      const conv = await proactive.getConversation('conv-1')
      assert.equal(conv, undefined)
    })
  })

  // -------------------------------------------------------------------------
  // sendActivity
  // -------------------------------------------------------------------------

  describe('sendActivity() — Conversation overload', () => {
    it('calls adapter.continueConversation with the correct identity and reference', async () => {
      const conv = makeConversation()
      await proactive.sendActivity(adapter, conv, { text: 'hi' })
      const stub = adapter.continueConversation as sinon.SinonStub
      assert.ok(stub.calledOnce)
      const [identity, ref] = stub.firstCall.args
      assert.equal(identity.aud, 'bot-app-id')
      assert.equal(ref.conversation.id, 'conv-1')
    })

    it('defaults activity.type to "message" when not set', async () => {
      const conv = makeConversation()
      let sentType: string | undefined
      sinon.restore()
      sinon.stub(adapter, 'continueConversation').callsFake(async (_identity, ref, logic) => {
        const act = Activity.getContinuationActivity(ref as any)
        const ctx = new TurnContext(adapter, act)
        sinon.stub(ctx, 'sendActivity').callsFake(async (a: any) => {
          sentType = a.type
          return { id: 'r1' }
        })
        await logic(ctx)
      })
      await proactive.sendActivity(adapter, conv, { text: 'hello' })
      assert.equal(sentType, 'message')
    })

    it('re-throws exceptions that occur inside the adapter callback', async () => {
      const conv = makeConversation()
      sinon.restore()
      sinon.stub(adapter, 'continueConversation').callsFake(async (_identity, _ref, logic) => {
        const act = Activity.fromObject({ type: 'event', channelId: 'webchat', conversation: { id: 'c1' } })
        const ctx = new TurnContext(adapter, act)
        sinon.stub(ctx, 'sendActivity').rejects(new Error('send-failed'))
        await logic(ctx)
      })
      await assert.rejects(
        () => proactive.sendActivity(adapter, conv, { text: 'hi' }),
        /send-failed/
      )
    })
  })

  describe('sendActivity() — string overload', () => {
    it('looks up storage and calls adapter.continueConversation', async () => {
      await proactive.storeConversation(makeConversation())
      await proactive.sendActivity(adapter, 'conv-1', { text: 'hi' })
      const stub = adapter.continueConversation as sinon.SinonStub
      assert.ok(stub.calledOnce)
    })

    it('throws when conversationId is not in storage', async () => {
      await assert.rejects(
        () => proactive.sendActivity(adapter, 'not-stored', { text: 'hi' })
      )
    })
  })

  // -------------------------------------------------------------------------
  // continueConversation
  // -------------------------------------------------------------------------

  describe('continueConversation() — Conversation overload', () => {
    it('calls adapter.continueConversation with correct identity and reference', async () => {
      const conv = makeConversation()
      await proactive.continueConversation(adapter, conv, async () => {})
      const stub = adapter.continueConversation as sinon.SinonStub
      assert.ok(stub.calledOnce)
      const [identity, ref] = stub.firstCall.args
      assert.equal(identity.aud, 'bot-app-id')
      assert.equal(ref.conversation.id, 'conv-1')
    })

    it('creates a fresh TurnState and loads/saves it around the handler', async () => {
      const conv = makeConversation()
      let stateLoadCalled = false
      let stateSaveCalled = false

      const loadOrig = TurnState.prototype.load
      const saveOrig = TurnState.prototype.save
      TurnState.prototype.load = async function () { stateLoadCalled = true; return this }
      TurnState.prototype.save = async function () { stateSaveCalled = true }

      try {
        await proactive.continueConversation(adapter, conv, async (_ctx, _state) => {})
      } finally {
        TurnState.prototype.load = loadOrig
        TurnState.prototype.save = saveOrig
      }

      assert.ok(stateLoadCalled)
      assert.ok(stateSaveCalled)
    })

    it('handler receives a TurnContext and a TurnState', async () => {
      const conv = makeConversation()
      let receivedContext: TurnContext | undefined
      let receivedState: TurnState | undefined

      await proactive.continueConversation(adapter, conv, async (ctx, state) => {
        receivedContext = ctx
        receivedState = state
      })

      assert.ok(receivedContext instanceof TurnContext)
      assert.ok(receivedState instanceof TurnState)
    })

    it('re-throws exceptions from inside the handler', async () => {
      const conv = makeConversation()
      await assert.rejects(
        () =>
          proactive.continueConversation(adapter, conv, async () => {
            throw new Error('handler-error')
          }),
        /handler-error/
      )
    })
  })

  describe('continueConversation() — string overload', () => {
    it('looks up storage then calls adapter.continueConversation', async () => {
      await proactive.storeConversation(makeConversation())
      await proactive.continueConversation(adapter, 'conv-1', async () => {})
      const stub = adapter.continueConversation as sinon.SinonStub
      assert.ok(stub.calledOnce)
    })

    it('throws when conversationId is not in storage', async () => {
      await assert.rejects(
        () => proactive.continueConversation(adapter, 'missing', async () => {})
      )
    })
  })

  // -------------------------------------------------------------------------
  // AgentApplication.proactive getter
  // -------------------------------------------------------------------------

  describe('AgentApplication.proactive getter', () => {
    it('throws when options.proactive was not set', () => {
      const appNoProactive = new AgentApplication({ storage })
      assert.throws(() => appNoProactive.proactive, /proactive/)
    })

    it('returns the Proactive instance when configured', () => {
      const inst = app.proactive
      assert.ok(inst instanceof Proactive)
    })

    it('initialises successfully when proactive.storage is omitted but options.storage is set', () => {
      const appWithFallback = new AgentApplication({ storage, proactive: {} })
      assert.ok(appWithFallback.proactive instanceof Proactive)
    })

    it('throws at construction when neither proactive.storage nor options.storage is set', () => {
      assert.throws(
        () => new AgentApplication({ proactive: {} }),
        /storage/
      )
    })
  })
})
