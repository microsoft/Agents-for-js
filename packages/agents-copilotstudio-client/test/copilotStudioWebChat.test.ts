import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach, type TestContext } from 'node:test'
import { createSandbox, SinonSandbox, SinonStub } from 'sinon'
import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import { CopilotStudioWebChat } from '../src/copilotStudioWebChat'
import { CopilotStudioClient } from '../src/copilotStudioClient'
import { firstValueFrom } from 'rxjs'
import { Errors } from '../src/errorHelper'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hasWebChatSequenceId (channelData: unknown): boolean {
  return (channelData as Record<string, unknown> | null | undefined)?.['webchat:sequence-id'] !== undefined
}

/** Creates a minimal Activity-like object. */
function makeActivity (overrides: Partial<Activity> = {}): Activity {
  return Activity.fromObject({
    type: 'message',
    text: 'hello',
    ...overrides,
  })
}

/** Creates a fake CopilotStudioClient with stubbed streaming methods. */
function createMockClient (sandbox: SinonSandbox, opts: {
  greetingActivities?: Partial<Activity>[]
  responseActivities?: Partial<Activity>[]
} = {}) {
  const greetingActivities = opts.greetingActivities ?? [
    {
      type: 'message',
      text: 'Hi there!',
      conversation: { id: 'conv-from-server' },
      replyToId: 'should-be-stripped',
    },
  ]
  const responseActivities = opts.responseActivities ?? [
    { type: 'message', text: 'Response', conversation: { id: 'conv-from-server' } },
  ]

  // Async generator that yields greeting activities
  async function * fakeStartConversationStreaming (): AsyncGenerator<Activity> {
    for (const a of greetingActivities) {
      yield Activity.fromObject(a)
    }
  }

  // Async generator that yields response activities
  async function * fakeSendActivityStreaming (): AsyncGenerator<Activity> {
    for (const a of responseActivities) {
      yield Activity.fromObject(a)
    }
  }

  const client = {
    startConversationStreaming: sandbox.stub().callsFake(fakeStartConversationStreaming),
    sendActivityStreaming: sandbox.stub().callsFake(fakeSendActivityStreaming),
  }

  return client as unknown as CopilotStudioClient & {
    startConversationStreaming: SinonStub
    sendActivityStreaming: SinonStub
  }
}

function thought (id: string, sender = 'bot'): Activity {
  return Activity.fromObject({
    id,
    type: 'typing',
    text: '',
    from: { id: sender, role: 'bot' },
    channelData: { streamType: 'streaming', streamSequence: 1 },
    entities: [{ type: 'thought', status: 'incomplete' }]
  })
}

function answer (id: string): Activity {
  return Activity.fromObject({
    id,
    type: 'message',
    text: 'Total sales: 370 units.',
    from: { id: 'bot', role: 'bot' },
    channelData: { streamType: 'final', streamId: 'before-answer' }
  })
}

function connectionFor (t: TestContext, client: CopilotStudioClient) {
  const connection = CopilotStudioWebChat.createConnection(client, { startConversation: false, showTyping: true })
  t.after(() => connection.end())
  const received: Partial<Activity>[] = []
  connection.activity$.subscribe(activity => received.push(activity))
  const post = () => new Promise<void>((resolve, reject) => {
    connection.postActivity(Activity.fromObject({ type: 'message', text: 'test' })).subscribe({
      complete: resolve,
      error: reject
    })
  })
  return { received, post }
}

function createTestConnection (t: TestContext, responses: () => AsyncGenerator<Activity>, showTyping = true) {
  const client = { sendActivityStreaming: responses } as unknown as CopilotStudioClient
  const connection = CopilotStudioWebChat.createConnection(client, { startConversation: false, showTyping })
  t.after(() => connection.end())
  const received: Partial<Activity>[] = []
  connection.activity$.subscribe(activity => received.push(activity))
  const post = () => new Promise<void>((resolve, reject) => {
    connection.postActivity(Activity.fromObject({ type: 'message', text: 'test' })).subscribe({
      complete: resolve,
      error: reject
    })
  })
  return { received, post }
}

function assertFallbackClosed (received: Partial<Activity>[]) {
  const initial = received.find(activity => activity.from?.id === 'agent' && activity.channelData?.streamType === 'streaming')
  assert.ok(initial)
  const finals = received.filter(activity => activity.from?.id === 'agent' && activity.channelData?.streamType === 'final')
  assert.equal(finals.length, 1)
  assert.equal(finals[0].channelData?.streamId, initial.id)
  assert.equal(finals[0].text, '')
  assert.equal(finals[0].type, 'typing')
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CopilotStudioWebChat.createConnection', function () {
  let sandbox: SinonSandbox

  beforeEach(function () {
    sandbox = createSandbox()
  })

  afterEach(function () {
    sandbox.restore()
  })

  // =========================================================================
  // New conversation (default behavior)
  // =========================================================================
  describe('new conversation (default)', function () {
    it('should call startConversationStreaming and emit greeting activities', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      const activities: Partial<Activity>[] = []
      const done = new Promise<void>((resolve) => {
        conn.activity$.subscribe({
          next: (a) => activities.push(a),
          complete: () => resolve(),
        })
      })

      // Give the async generator time to yield
      await new Promise((resolve) => setTimeout(resolve, 50))
      conn.end()
      await done

      assert(client.startConversationStreaming.calledOnce, 'startConversationStreaming should be called once')

      const messageActivities = activities.filter((a) => a.type === 'message')
      assert(messageActivities.length >= 1, 'should emit at least one message activity')
      assert.strictEqual(messageActivities[0].text, 'Hi there!')
    })

    it('should add timestamp and webchat:sequence-id to emitted activities', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      const activities: Partial<Activity>[] = []
      const done = new Promise<void>((resolve) => {
        conn.activity$.subscribe({
          next: (a) => activities.push(a),
          complete: () => resolve(),
        })
      })

      await new Promise((resolve) => setTimeout(resolve, 50))
      conn.end()
      await done

      for (const a of activities) {
        assert(a.timestamp, 'activity should have a timestamp')
        assert(
          hasWebChatSequenceId(a.channelData),
          'activity should have webchat:sequence-id'
        )
      }
    })

    it('should transition connectionStatus$ to 2 on subscribe', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      const statuses: number[] = []
      conn.connectionStatus$.subscribe((s) => statuses.push(s))
      conn.activity$.subscribe({})

      await new Promise((resolve) => setTimeout(resolve, 50))
      conn.end()

      assert(statuses.includes(2), 'connectionStatus$ should reach 2 (connected)')
    })

    it('should strip replyToId from greeting activities', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      const activities: Partial<Activity>[] = []
      const done = new Promise<void>((resolve) => {
        conn.activity$.subscribe({
          next: (a) => activities.push(a),
          complete: () => resolve(),
        })
      })

      await new Promise((resolve) => setTimeout(resolve, 50))
      conn.end()
      await done

      const messageActivities = activities.filter((a) => a.type === 'message')
      for (const a of messageActivities) {
        assert.strictEqual(a.replyToId, undefined, 'replyToId should be stripped')
      }
    })

    it('should capture conversationId from first response activity', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      assert.strictEqual(conn.conversationId, undefined, 'conversationId should be undefined before subscribe')

      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.strictEqual(conn.conversationId, 'conv-from-server', 'conversationId should be captured from response')
      conn.end()
    })
  })

  // =========================================================================
  // Conversation resume
  // =========================================================================
  describe('conversation resume', function () {
    it('should NOT call startConversationStreaming when conversationId is provided', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        conversationId: 'existing-conv-123',
      })

      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.strictEqual(
        client.startConversationStreaming.callCount, 0,
        'startConversationStreaming should NOT be called when resuming'
      )
      conn.end()
    })

    it('should return the provided conversationId from the getter', function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        conversationId: 'existing-conv-123',
      })

      assert.strictEqual(conn.conversationId, 'existing-conv-123')
      conn.end()
    })

    it('should pass conversationId to sendActivityStreaming on postActivity', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        conversationId: 'existing-conv-123',
      })

      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      const activity = makeActivity()
      const id = await firstValueFrom(conn.postActivity(activity))

      assert(typeof id === 'string' && id.length > 0, 'postActivity should return an activity ID')
      assert(client.sendActivityStreaming.calledOnce, 'sendActivityStreaming should be called')

      const [, convIdArg] = client.sendActivityStreaming.firstCall.args
      assert.strictEqual(convIdArg, 'existing-conv-123', 'conversationId should be passed to sendActivityStreaming')
      conn.end()
    })

    it('should transition connectionStatus$ to 2 even when resuming', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        conversationId: 'existing-conv-123',
      })

      const statuses: number[] = []
      conn.connectionStatus$.subscribe((s) => statuses.push(s))
      conn.activity$.subscribe({})

      await new Promise((resolve) => setTimeout(resolve, 50))

      assert(statuses.includes(2), 'connectionStatus$ should reach 2 when resuming')
      conn.end()
    })
  })

  // =========================================================================
  // startConversation control
  // =========================================================================
  describe('startConversation setting', function () {
    it('startConversation: false should skip startConversationStreaming even without conversationId', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        startConversation: false,
      })

      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.strictEqual(
        client.startConversationStreaming.callCount, 0,
        'startConversationStreaming should NOT be called when startConversation is false'
      )
      conn.end()
    })

    it('startConversation: true with conversationId should call startConversationStreaming', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client, {
        conversationId: 'existing-conv-123',
        startConversation: true,
      })

      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.strictEqual(
        client.startConversationStreaming.callCount, 1,
        'startConversationStreaming should be called when startConversation is explicitly true'
      )
      conn.end()
    })
  })

  // =========================================================================
  // Error handling
  // =========================================================================
  describe('error handling', function () {
    it('should throw when postActivity is called after end()', function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      conn.activity$.subscribe({})
      conn.end()

      assert.throws(
        () => conn.postActivity(makeActivity()),
        /Connection has been ended/,
        'postActivity after end() should throw'
      )
    })

    it('should throw when postActivity is called with null activity', function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      conn.activity$.subscribe({})

      assert.throws(
        () => conn.postActivity(null as unknown as Activity),
        /Activity cannot be null/,
        'postActivity with null should throw'
      )
      conn.end()
    })
  })

  // =========================================================================
  // Edge cases
  // =========================================================================
  describe('edge cases', function () {
    it('multiple subscriptions to activity$ should not trigger duplicate startConversation calls', async function () {
      const client = createMockClient(sandbox)
      const conn = CopilotStudioWebChat.createConnection(client)

      // First subscription
      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      // Second subscription
      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      assert.strictEqual(
        client.startConversationStreaming.callCount, 1,
        'startConversationStreaming should only be called once despite multiple subscriptions'
      )
      conn.end()
    })

    it('conversationId captured from sendActivityStreaming response when not set upfront', async function () {
      const client = createMockClient(sandbox, {
        greetingActivities: [
          // greeting with no conversation id
          { type: 'message', text: 'Hello' },
        ],
        responseActivities: [
          { type: 'message', text: 'Response', conversation: { id: 'captured-conv-id' } },
        ],
      })

      const conn = CopilotStudioWebChat.createConnection(client)
      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))

      // conversationId should still be undefined (greeting had no conversation)
      assert.strictEqual(conn.conversationId, undefined, 'conversationId should be undefined before sendActivity response')

      const activity = makeActivity()
      // Wait for the postActivity observable to complete (not just first value)
      await new Promise<void>((resolve, reject) => {
        conn.postActivity(activity).subscribe({
          complete: () => resolve(),
          error: (e) => reject(e),
        })
      })

      assert.strictEqual(conn.conversationId, 'captured-conv-id', 'conversationId should be captured from sendActivity response')
      conn.end()
    })
  })

  describe('post-answer activity filtering', function () {
    it('does not forward post-answer empty thoughts while the service response is still running', async (t) => {
      let release!: () => void
      let reachedThought!: () => void
      const waiting = new Promise<void>(resolve => { release = resolve })
      const ready = new Promise<void>(resolve => { reachedThought = resolve })
      const client = {
        async * sendActivityStreaming () {
          yield thought('before-answer')
          yield answer('answer')
          yield thought('after-answer')
          reachedThought()
          await waiting
        }
      } as unknown as CopilotStudioClient
      const connection = CopilotStudioWebChat.createConnection(client, { startConversation: false })
      t.after(() => connection.end())
      const received: Partial<Activity>[] = []
      connection.activity$.subscribe(activity => received.push(activity))
      const done = new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'reproduce 881' })).subscribe({
          complete: resolve,
          error: reject
        })
      })
      await ready
      // Assert before SSE ends: end-of-response cleanup cannot satisfy this check.
      const thoughtWasForwarded = received.some(activity => activity.id === 'after-answer')
      release()
      await done
      assert.ok(received.some(activity => activity.id === 'before-answer'))
      assert.ok(received.some(activity => activity.id === 'answer'))
      assert.equal(thoughtWasForwarded, false, 'Empty thoughts reopen WebChat busy after the answer')
    })

    it('preserves visible progress, partial follow-up answers, cards, and stream finals', async (t) => {
      const progress = Activity.fromObject({ ...thought('progress'), text: 'Searching another source' })
      const partial = Activity.fromObject({ ...thought('partial'), text: 'Another answer' })
      const erasePartial = Activity.fromObject({
        ...thought('erase-partial'),
        channelData: { streamType: 'streaming', streamId: 'partial', streamSequence: 2 }
      })
      const card = Activity.fromObject({
        ...thought('card'),
        attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard' } }]
      })
      const schema = Activity.fromObject({
        ...thought('schema'),
        entities: [{ type: 'thought' }, { type: 'https://schema.org/Message', '@id': '', abstract: 'Working' }]
      })
      const final = Activity.fromObject({
        ...thought('final'),
        channelData: { streamType: 'final', streamId: 'partial' }
      })
      const entityFinal = Activity.fromObject({
        ...thought('entity-final'),
        channelData: undefined,
        entities: [{ type: 'thought' }, { type: 'streaminfo', streamType: 'final', streamId: 'card' }]
      })
      const client = {
        async * sendActivityStreaming () {
          for (const activity of [answer('answer'), thought('hidden'), progress, partial, erasePartial, card, schema, final, entityFinal, answer('second-answer')]) {
            yield activity
          }
        }
      } as unknown as CopilotStudioClient
      const { received, post } = connectionFor(t, client)
      await post()
      const ids = received.filter(activity => activity.from?.id === 'bot').map(activity => activity.id)
      assert.deepEqual(ids, ['answer', 'progress', 'partial', 'erase-partial', 'card', 'schema', 'final', 'entity-final', 'second-answer'])
    })

    it('keeps senders and subsequent response requests independent', async (t) => {
      let request = 0
      const client = {
        async * sendActivityStreaming () {
          if (request++ === 0) {
            yield answer('answer')
            yield thought('hidden')
            yield thought('other-sender', 'other-bot')
          } else {
            yield thought('next-turn')
            yield answer('next-answer')
          }
        }
      } as unknown as CopilotStudioClient
      const { received, post } = connectionFor(t, client)
      await post()
      await post()
      assert.ok(!received.some(activity => activity.id === 'hidden'))
      assert.ok(received.some(activity => activity.id === 'other-sender'))
      assert.ok(received.some(activity => activity.id === 'next-turn'))
    })

    it('does not treat empty message activities as delivered answers', async (t) => {
      const client = {
        async * sendActivityStreaming () {
          yield Activity.fromObject({ ...answer('empty'), text: '' })
          yield thought('still-working')
        }
      } as unknown as CopilotStudioClient
      const { received, post } = connectionFor(t, client)
      await post()
      assert.ok(received.some(activity => activity.id === 'still-working'))
    })

    it('keeps a hidden stream hidden until it produces visible content', async (t) => {
      const client = {
        async * sendActivityStreaming () {
          yield answer('answer')
          yield thought('hidden')
          yield Activity.fromObject({
            ...thought('hidden-update'),
            channelData: { streamType: 'streaming', streamId: 'hidden', streamSequence: 2 },
            entities: []
          })
          yield Activity.fromObject({
            ...thought('visible-update'),
            text: 'Follow-up answer',
            channelData: { streamType: 'streaming', streamId: 'hidden', streamSequence: 3 }
          })
          yield Activity.fromObject({
            ...thought('erase-update'),
            channelData: { streamType: 'streaming', streamId: 'hidden', streamSequence: 4 }
          })
        }
      } as unknown as CopilotStudioClient
      const { received, post } = connectionFor(t, client)
      await post()
      assert.deepEqual(received.filter(activity => activity.from?.id === 'bot').map(activity => activity.id),
        ['answer', 'visible-update', 'erase-update'])
    })

    it('filters trailing greeting thoughts without closing the connection', async (t) => {
      let started!: () => void
      const ready = new Promise<void>(resolve => { started = resolve })
      const client = {
        async * startConversationStreaming () {
          yield answer('greeting')
          yield thought('trailing-greeting-thought')
          started()
        }
      } as unknown as CopilotStudioClient
      const connection = CopilotStudioWebChat.createConnection(client)
      t.after(() => connection.end())
      const received: Partial<Activity>[] = []
      let completed = false
      connection.activity$.subscribe({
        next: activity => received.push(activity),
        complete: () => { completed = true }
      })
      await ready
      assert.deepEqual(received.map(activity => activity.id), ['greeting'])
      assert.equal(completed, false)
    })
  })

  describe('typing lifecycle and handoff', function () {
    for (const scenario of ['greeting', 'request'] as const) {
      for (const response of ['empty', 'message'] as const) {
        it(`cleans up ${scenario} typing on the original subscriber after a response (${response})`, async (t) => {
          let release!: () => void
          let started!: () => void
          const waiting = new Promise<void>(resolve => { release = resolve })
          const ready = new Promise<void>(resolve => { started = resolve })
          async function * activities () {
            started()
            await waiting
            if (response === 'message') {
              yield Activity.fromObject({ id: 'answer', type: 'message', text: 'Answer', from: { id: 'service-bot' } })
            }
          }
          const client = {
            startConversationStreaming: activities,
            sendActivityStreaming: activities
          } as unknown as CopilotStudioClient
          const connection = CopilotStudioWebChat.createConnection(client, {
            startConversation: scenario === 'greeting',
            showTyping: true
          })
          const first: Partial<Activity>[] = []
          const second: Partial<Activity>[] = []
          const originalSubscription = connection.activity$.subscribe(activity => first.push(activity))
          t.after(() => {
            release()
            connection.end()
            originalSubscription.unsubscribe()
          })
          const done = scenario === 'request'
            ? new Promise<void>((resolve, reject) => {
              connection.postActivity(Activity.fromObject({ type: 'message', text: 'test' })).subscribe({
                complete: resolve,
                error: reject
              })
            })
            : undefined
          await ready
          connection.activity$.subscribe(activity => second.push(activity))
          release()
          await done
          // Allow greeting completion and its finally cleanup to finish too.
          await new Promise<void>(resolve => setImmediate(resolve))

          assert.equal(originalSubscription.closed, false)
          assertFallbackClosed(first)
          assert.ok(!second.some(activity => activity.from?.id === 'agent'))
          assert.deepEqual(second.map(activity => activity.id), response === 'message' ? ['answer'] : [])
          const initial = first.find(activity => activity.channelData?.streamType === 'streaming')!
          const final = first.find(activity => activity.channelData?.streamType === 'final')!
          assert.ok(final.timestamp)
          assert.ok(final.channelData['webchat:sequence-id'] > initial.channelData['webchat:sequence-id'])
        })
      }
    }

    it('hands SDK typing over to service progress before the response ends', async (t) => {
      let release!: () => void
      let progressReceived!: () => void
      const waiting = new Promise<void>(resolve => { release = resolve })
      const ready = new Promise<void>(resolve => { progressReceived = resolve })
      const client = {
        async * sendActivityStreaming () {
          yield Activity.fromObject({
            id: 'progress',
            type: 'typing',
            text: 'Processing',
            from: { id: 'service-bot', role: 'bot' },
            channelData: { streamType: 'informative', streamSequence: 1 }
          })
          progressReceived()
          await waiting
        }
      } as unknown as CopilotStudioClient
      const connection = CopilotStudioWebChat.createConnection(client, { startConversation: false, showTyping: true })
      t.after(() => connection.end())
      const received: Partial<Activity>[] = []
      connection.activity$.subscribe(activity => received.push(activity))
      const done = new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'test' })).subscribe({
          complete: resolve,
          error: reject
        })
      })
      await ready
      const beforeEnd = [...received]
      release()
      await done
      const initial = beforeEnd.find(activity => activity.type === 'typing' && activity.from?.id === 'agent')
      assert.ok(initial, 'Typing should be shown while waiting for the service')
      const finalIndex = beforeEnd.findIndex(activity => activity.from?.id === initial.from?.id &&
        activity.channelData?.streamType === 'final' && activity.channelData?.streamId === initial.id)
      const progressIndex = beforeEnd.findIndex(activity => activity.id === 'progress')
      assert.ok(finalIndex >= 0 && finalIndex < progressIndex, 'SDK typing must be cleared before displaying service progress')
      assert.equal(beforeEnd[progressIndex].text, 'Processing')
    })

    for (const responseType of ['message', 'typing'] as const) {
      it(`hands typing over to a service ${responseType} even without informative progress`, async (t) => {
        const { received, post } = createTestConnection(t, async function * () {
          yield Activity.fromObject({ id: 'service', type: responseType, from: { id: 'service-bot' }, text: responseType === 'message' ? 'Answer' : '' })
        })
        await post()
        assertFallbackClosed(received)
        const finalIndex = received.findIndex(activity => activity.channelData?.streamType === 'final')
        assert.ok(finalIndex < received.findIndex(activity => activity.id === 'service'))
      })
    }

    it('cleans up fallback typing on an empty response', async (t) => {
      const { received, post } = createTestConnection(t, async function * () {})
      await post()
      assertFallbackClosed(received)
      assert.equal(received.filter(activity => activity.type === 'message').length, 1)
    })

    it('cleans up fallback typing while preserving request errors', async (t) => {
      const error = ExceptionHelper.generateException(Error, Errors.ConnectionAlreadyEnded)
      const { received, post } = createTestConnection(t, async function * () {
        throw error
      })
      await assert.rejects(post(), error)
      assertFallbackClosed(received)
    })

    it('does not generate fallback activities when showTyping is disabled', async (t) => {
      const { received, post } = createTestConnection(t, async function * () {
        yield Activity.fromObject({ id: 'progress', type: 'typing', text: 'Processing', from: { id: 'service-bot' } })
      }, false)
      await post()
      assert.ok(!received.some(activity => activity.from?.id === 'agent'))
      assert.ok(received.some(activity => activity.id === 'progress'))
    })

    it('hands greeting typing over to service progress', async (t) => {
      let started!: () => void
      const ready = new Promise<void>(resolve => { started = resolve })
      const client = {
        async * startConversationStreaming () {
          yield Activity.fromObject({
            id: 'greeting-progress',
            type: 'typing',
            text: 'Processing',
            from: { id: 'service-bot' },
            channelData: { streamType: 'informative', streamSequence: 1 }
          })
          started()
        }
      } as unknown as CopilotStudioClient
      const connection = CopilotStudioWebChat.createConnection(client, { showTyping: true })
      t.after(() => connection.end())
      const received: Partial<Activity>[] = []
      connection.activity$.subscribe(activity => received.push(activity))
      await ready
      assertFallbackClosed(received)
      assert.equal(received.at(-1)?.id, 'greeting-progress')
    })

    it('keeps overlapping fallback streams independent', async (t) => {
      let release!: () => void
      let started!: () => void
      const waiting = new Promise<void>(resolve => { release = resolve })
      const ready = new Promise<void>(resolve => { started = resolve })
      let requests = 0
      const { received, post } = createTestConnection(t, async function * () {
        if (requests++ === 0) {
          started()
          await waiting
        } else {
          yield Activity.fromObject({ id: 'progress', type: 'typing', text: 'Processing', from: { id: 'service-bot' } })
        }
      })
      const first = post()
      await ready
      await post()
      const starts = received.filter(activity => activity.from?.id === 'agent' && activity.channelData?.streamType === 'streaming')
      const finalsBeforeRelease = received.filter(activity => activity.from?.id === 'agent' && activity.channelData?.streamType === 'final')
      release()
      await first
      assert.equal(starts.length, 2)
      assert.equal(finalsBeforeRelease.length, 1)
      assert.equal(finalsBeforeRelease[0].channelData?.streamId, starts[1].id)
      assert.equal(received.at(-1)?.channelData?.streamId, starts[0].id)
    })
  })
})
