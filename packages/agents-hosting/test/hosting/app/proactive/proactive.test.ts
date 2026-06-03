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
    { aud: 'bot-app-id' },
    {
      conversation: { id: 'conv-1', isGroup: false },
      serviceUrl: 'https://example.com',
      channelId: 'webchat',
      user: { id: 'user-1', name: 'User' },
      agent: { id: 'bot-1', name: 'Bot' }
    }
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
    it('writes with key proactive/conversations/{conversationId} and returns the id', async () => {
      const ctx = makeTurnContext(adapter)
      const id = await proactive.storeConversation(ctx)
      assert.equal(id, 'conv-1')
      const stored = await storage.read(['proactive/conversations/conv-1'])
      assert.ok(stored['proactive/conversations/conv-1'])
    })
  })

  describe('storeConversation(conversation)', () => {
    it('stores an explicit Conversation and returns the conversation id', async () => {
      const conv = makeConversation()
      const id = await proactive.storeConversation(conv)
      assert.equal(id, 'conv-1')
      const stored = await storage.read(['proactive/conversations/conv-1'])
      assert.ok(stored['proactive/conversations/conv-1'])
    })

    it('throws when conversation.id is empty', async () => {
      const conv = new Conversation(
        { aud: 'bot-app-id' },
        { conversation: { id: '', isGroup: false }, serviceUrl: 'https://example.com', channelId: 'webchat', user: { id: 'u1' }, agent: { id: 'b1' } }
      )
      await assert.rejects(() => proactive.storeConversation(conv), /conversation\.id/)
    })

    it('throws when serviceUrl is empty', async () => {
      const conv = new Conversation(
        { aud: 'bot-app-id' },
        { conversation: { id: 'conv-1', isGroup: false }, serviceUrl: '', channelId: 'webchat', user: { id: 'u1' }, agent: { id: 'b1' } }
      )
      await assert.rejects(() => proactive.storeConversation(conv), /serviceUrl/)
    })

    it('throws when claims.aud is empty', async () => {
      const conv = new Conversation(
        { aud: '' },
        { conversation: { id: 'conv-1', isGroup: false }, serviceUrl: 'https://example.com', channelId: 'webchat', user: { id: 'u1' }, agent: { id: 'b1' } }
      )
      await assert.rejects(() => proactive.storeConversation(conv), /aud/)
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

    it('throws when the underlying sendActivity returns undefined', async () => {
      const conv = makeConversation()
      sinon.restore()
      sinon.stub(adapter, 'continueConversation').callsFake(async (_identity, ref, logic) => {
        const act = Activity.getContinuationActivity(ref as any)
        const ctx = new TurnContext(adapter, act)
        sinon.stub(ctx, 'sendActivity').resolves(undefined)
        await logic(ctx)
      })
      await assert.rejects(
        () => proactive.sendActivity(adapter, conv, { text: 'hi' }),
        /ResourceResponse/
      )
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

    it('makes continuationActivity fields visible on ctx.activity inside the handler', async () => {
      const conv = makeConversation()
      let receivedValue: unknown
      await proactive.continueConversation(
        adapter,
        conv,
        async (ctx) => {
          receivedValue = ctx.activity.value
        },
        undefined,
        { value: { foo: 'bar' } }
      )
      assert.deepEqual(receivedValue, { foo: 'bar' })
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
  // createConversation
  // -------------------------------------------------------------------------

  describe('createConversation()', () => {
    const makeCreateOpts = (overrides: Partial<{
      storeConversation: boolean
      members: Array<{ id: string }>
    }> = {}) => ({
      identity: { aud: 'bot-app-id' },
      channelId: 'msteams',
      serviceUrl: 'https://smba.trafficmanager.net/teams/',
      scope: 'https://api.botframework.com',
      parameters: { members: overrides.members ?? [{ id: 'user-1' }] },
      storeConversation: overrides.storeConversation,
    })

    /**
     * Returns a fake adapter with createConversationAsync that immediately invokes
     * the logic callback with a synthetic TurnContext, mimicking CloudAdapter behaviour.
     */
    const makeCloudAdapter = (conversationId = 'new-conv-1') => ({
      continueConversation: adapter.continueConversation.bind(adapter),
      createConversationAsync: async (
        _appId: string,
        channelId: string,
        serviceUrl: string,
        _scope: string,
        params: { members?: Array<{ id: string }> },
        logic: (ctx: TurnContext) => Promise<void>
      ) => {
        const act = Activity.fromObject({
          type: 'event',
          channelId,
          serviceUrl,
          conversation: { id: conversationId, isGroup: false },
          from: { id: params.members?.[0]?.id ?? 'user-1' },
          recipient: { id: 'bot-app-id' },
        })
        await logic(new TurnContext(adapter, act, { aud: 'bot-app-id' }))
      },
    })

    it('throws a clear error when adapter does not support createConversationAsync', async () => {
      // TestAdapter does not have createConversationAsync — expect a helpful TypeError
      await assert.rejects(
        () => proactive.createConversation(adapter, makeCreateOpts() as any),
        (err: Error) => {
          assert.ok(err instanceof TypeError, 'Expected TypeError')
          assert.match(err.message, /CloudAdapter/)
          return true
        }
      )
    })

    it('returns a Conversation with the id from the created conversation', async () => {
      const cloudAdapter = makeCloudAdapter('new-conv-42')
      const conv = await proactive.createConversation(cloudAdapter as any, makeCreateOpts() as any)
      assert.equal(conv.reference.conversation.id, 'new-conv-42')
      assert.equal(conv.claims.aud, 'bot-app-id')
    })

    it('invokes the handler with a TurnContext', async () => {
      const cloudAdapter = makeCloudAdapter()
      let handlerCalled = false
      await proactive.createConversation(
        cloudAdapter as any,
        makeCreateOpts() as any,
        async (ctx) => {
          handlerCalled = true
          assert.ok(ctx instanceof TurnContext)
        }
      )
      assert.ok(handlerCalled)
    })

    it('re-throws errors thrown inside the handler', async () => {
      const cloudAdapter = makeCloudAdapter()
      await assert.rejects(
        () => proactive.createConversation(
          cloudAdapter as any,
          makeCreateOpts() as any,
          async () => { throw new Error('handler-error') }
        ),
        /handler-error/
      )
    })

    it('stores the conversation when storeConversation is true', async () => {
      const cloudAdapter = makeCloudAdapter('stored-conv-1')
      await proactive.createConversation(
        cloudAdapter as any,
        makeCreateOpts({ storeConversation: true }) as any
      )
      const stored = await storage.read(['proactive/conversations/stored-conv-1'])
      assert.ok(stored['proactive/conversations/stored-conv-1'])
    })

    it('throws when parameters.members is empty', async () => {
      const cloudAdapter = makeCloudAdapter()
      await assert.rejects(
        () => proactive.createConversation(
          cloudAdapter as any,
          makeCreateOpts({ members: [] }) as any
        ),
        /members/
      )
    })
  })

  // -------------------------------------------------------------------------
  // AgentApplication.proactive getter
  // -------------------------------------------------------------------------

  describe('AgentApplication.proactive getter', () => {
    it('returns a Proactive instance even when proactive options were not explicitly set', () => {
      const appStorageOnly = new AgentApplication({ storage })
      assert.ok(appStorageOnly.proactive instanceof Proactive)
    })

    it('returns the Proactive instance when configured', () => {
      const inst = app.proactive
      assert.ok(inst instanceof Proactive)
    })

    it('initialises successfully when proactive.storage is omitted but options.storage is set', () => {
      const appWithFallback = new AgentApplication({ storage, proactive: {} })
      assert.ok(appWithFallback.proactive instanceof Proactive)
    })

    it('constructs successfully with proactive: {} and storage operations throw but sendActivity still works', async () => {
      const appNoStorage = new AgentApplication({ proactive: {} })
      assert.ok(appNoStorage.proactive instanceof Proactive)
      // Storage-backed operations throw when no storage is configured
      const conv = makeConversation()
      await assert.rejects(() => appNoStorage.proactive.storeConversation(conv), /storage/)
      // But sendActivity with a Conversation object requires no storage
      await appNoStorage.proactive.sendActivity(adapter, conv, { text: 'hi' })
    })

    it('continueConversation throws when proactive storage is set but app storage is not', async () => {
      const proactiveOnlyStorage = new MemoryStorage()
      const appProactiveOnly = new AgentApplication({ proactive: { storage: proactiveOnlyStorage } })
      const conv = makeConversation()
      await assert.rejects(
        () => appProactiveOnly.proactive.continueConversation(adapter, conv, async () => {}),
        /storage/
      )
    })

    it('throws on .proactive access when no storage was configured at all', () => {
      const appNoStorage = new AgentApplication({})
      assert.throws(() => appNoStorage.proactive, /storage/)
    })
  })
})
