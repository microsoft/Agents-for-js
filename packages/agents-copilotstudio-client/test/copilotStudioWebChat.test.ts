import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { createSandbox, SinonSandbox, SinonStub } from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import { CopilotStudioWebChat } from '../src/copilotStudioWebChat'
import { CopilotStudioClient } from '../src/copilotStudioClient'
import { firstValueFrom } from 'rxjs'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
          (a.channelData as Record<string, unknown>)?.['webchat:sequence-id'] !== undefined,
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
})
