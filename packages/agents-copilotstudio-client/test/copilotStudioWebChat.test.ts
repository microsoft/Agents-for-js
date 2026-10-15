import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { createSandbox, SinonSandbox, SinonStub } from 'sinon'
import { Activity } from '@microsoft/agents-activity'
import { CopilotStudioWebChat } from '../src/copilotStudioWebChat'
import { CopilotStudioClient } from '../src/copilotStudioClient'
import { firstValueFrom, filter } from 'rxjs'

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
  async function * fakeStartConversationStreaming (): AsyncGenerator<Activity, string> {
    const activities = greetingActivities.map(a => Activity.fromObject(a))
    for (const activity of activities) {
      yield activity
    }
    return activities.find(activity => activity.conversation?.id)?.conversation?.id ?? 'header-conversation-id'
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

    it('uses start metadata when greeting activities have no conversation ID', async function () {
      const client = createMockClient(sandbox, {
        greetingActivities: [{ type: 'message', text: 'Hello' }],
      })
      const conn = CopilotStudioWebChat.createConnection(client)
      conn.activity$.subscribe({})
      await new Promise((resolve) => setTimeout(resolve, 50))
      assert.equal(conn.conversationId, 'header-conversation-id')
      await new Promise<void>((resolve, reject) => {
        conn.postActivity(makeActivity()).subscribe({ complete: resolve, error: reject })
      })
      assert.equal(client.sendActivityStreaming.firstCall.args[1], 'header-conversation-id')
      conn.end()
    })
  })
})

describe('WebChat conversation isolation', () => {
  function signal () {
    let complete!: () => void
    const promise = new Promise<void>((resolve) => { complete = resolve })
    return { promise, resolve: complete }
  }

  function startResponse (id?: string, activity?: object) {
    const reading = signal()
    const finish = signal()
    let sentActivity = false
    const body = new ReadableStream<Uint8Array>({
      async pull (controller) {
        reading.resolve()
        if (activity && !sentActivity) {
          sentActivity = true
          controller.enqueue(new TextEncoder().encode(`event: activity\ndata: ${JSON.stringify(activity)}\n\n`))
          return
        }
        await finish.promise
        controller.enqueue(new TextEncoder().encode('event: end\ndata: done\n\n'))
        controller.close()
      }
    })
    return {
      reading,
      finish,
      response: new Response(body, {
        headers: { 'Content-Type': 'text/event-stream', ...(id && { 'x-ms-conversationid': id }) }
      })
    }
  }

  function client () {
    return new CopilotStudioClient({ directConnectUrl: 'https://fixture.example/api' }, 'test-token')
  }

  it('preserves WebChat activity-ID precedence when the header disagrees', async (t) => {
    const responses = [
      startResponse('header-A', { type: 'message', text: 'Hello', conversation: { id: 'activity-A' } }),
      startResponse('activity-A')
    ]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const connection = CopilotStudioWebChat.createConnection(client())
    const subscription = connection.activity$.subscribe()
    try {
      await firstValueFrom(connection.postActivity(Activity.fromObject({ type: 'message', text: 'Follow-up' })))
      assert.match(String(fetchMock.mock.calls[1].arguments[0]), /\/conversations\/activity-A\?/)
    } finally {
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('waits for startup completion before posting while greeting activities still stream', async (t) => {
    const startup = startResponse('A', { type: 'message', text: 'Greeting', conversation: { id: 'A' } })
    const turn = startResponse('A')
    turn.finish.resolve()
    const greeting = signal()
    let requests = 0
    t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? startup.response : turn.response)
    const connection = CopilotStudioWebChat.createConnection(client())
    const subscription = connection.activity$.subscribe(activity => {
      if (activity.text === 'Greeting') {
        greeting.resolve()
      }
    })
    let posted: Promise<void> | undefined
    try {
      await greeting.promise
      posted = new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'A' })).subscribe({ complete: resolve, error: reject })
      })
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.equal(requests, 1, 'A send must wait for its own startup to finish')
      startup.finish.resolve()
      await posted
      assert.equal(requests, 2)
    } finally {
      startup.finish.resolve()
      await Promise.allSettled(posted ? [posted] : [])
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('preserves implicit WebChat sends when startup is disabled', async (t) => {
    const responses = [startResponse('prior-A'), startResponse('prior-A')]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const shared = client()
    await shared.startConversationAsync(false)
    const connection = CopilotStudioWebChat.createConnection(shared, { startConversation: false })
    const subscription = connection.activity$.subscribe()
    try {
      await new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'A' })).subscribe({ complete: resolve, error: reject })
      })
      assert.match(String(fetchMock.mock.calls[1].arguments[0]), /\/conversations\/prior-A\?/)
    } finally {
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('preserves WebChat startup and first sends when no start ID is returned', async (t) => {
    const responses = [startResponse(), startResponse('first-reply-A', { type: 'message', text: 'Hello', conversation: { id: 'first-reply-A' } })]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const connection = CopilotStudioWebChat.createConnection(client())
    const subscription = connection.activity$.subscribe()
    try {
      await firstValueFrom(connection.connectionStatus$.pipe(filter(status => status === 2)))
      assert.equal(connection.conversationId, undefined)
      await new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'A' })).subscribe({ complete: resolve, error: reject })
      })
      assert.equal(connection.conversationId, 'first-reply-A')
    } finally {
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('preserves direct implicit client continuation after WebChat startup', async (t) => {
    const responses = [startResponse('prior-B'), startResponse('webchat-A'), startResponse('webchat-A')]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const shared = client()
    await shared.startConversationAsync(false)
    const connection = CopilotStudioWebChat.createConnection(shared)
    const subscription = connection.activity$.subscribe()
    try {
      await firstValueFrom(connection.connectionStatus$.pipe(filter(status => status === 2)))
      await shared.sendActivity(Activity.fromObject({ type: 'message', text: 'Direct follow-up' }))
      assert.equal(connection.conversationId, 'webchat-A')
      assert.match(String(fetchMock.mock.calls[2].arguments[0]), /\/conversations\/webchat-A\?/)
    } finally {
      connection.end()
      subscription.unsubscribe()
    }
  })

  for (const forwardMetadata of [false, true]) {
    for (const finishFirst of [0, 1]) {
      it(`isolates overridden WebChat starts with forwarding=${forwardMetadata}, first=${finishFirst}`, async (t) => {
        const responses = [startResponse('A'), startResponse('B')]
        const requests: { url: string, id: string | undefined }[] = []
        let index = 0
        t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body))
          if (!body.activity) {
            return responses[index++].response
          }
          requests.push({ url: String(url), id: body.activity.conversation?.id })
          const response = startResponse()
          response.finish.resolve()
          return response.response
        })
        const shared = client()
        const originalStart = shared.startConversationStreaming.bind(shared)
        t.mock.method(shared, 'startConversationStreaming', async function * () {
          await Promise.resolve()
          const id = yield * originalStart()
          if (forwardMetadata) {
            return id
          }
        })
        const connections = [CopilotStudioWebChat.createConnection(shared), CopilotStudioWebChat.createConnection(shared)]
        const subscriptions = connections.map(connection => connection.activity$.subscribe())
        try {
          await Promise.all(responses.map(response => response.reading.promise))
          responses[finishFirst].finish.resolve()
          await firstValueFrom(connections[finishFirst].connectionStatus$.pipe(filter(status => status === 2)))
          responses[1 - finishFirst].finish.resolve()
          await firstValueFrom(connections[1 - finishFirst].connectionStatus$.pipe(filter(status => status === 2)))
          for (const connection of connections) {
            await new Promise<void>((resolve, reject) => {
              connection.postActivity(Activity.fromObject({ type: 'message', text: 'Follow-up' })).subscribe({ complete: resolve, error: reject })
            })
          }
          assert.deepEqual(connections.map(connection => connection.conversationId), forwardMetadata ? ['A', 'B'] : [undefined, undefined])
          assert.deepEqual(requests.map(request => request.id), forwardMetadata ? ['A', 'B'] : ['', ''])
          assert.deepEqual(requests.map(request => new URL(request.url).pathname), forwardMetadata ? ['/api/conversations/A', '/api/conversations/B'] : ['/api/conversations', '/api/conversations'])
        } finally {
          responses.forEach(response => response.finish.resolve())
          connections.forEach(connection => connection.end())
          subscriptions.forEach(subscription => subscription.unsubscribe())
        }
      })
    }
  }

  for (const activityId of [undefined, ' ', 'explicit-C']) {
    it(`does not borrow another start ID after ID-less WebChat startup, activity ID=${activityId}`, async (t) => {
      const responses = [startResponse(), startResponse('B'), startResponse()]
      responses[1].finish.resolve()
      responses[2].finish.resolve()
      let index = 0
      const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
      const shared = client()
      const connection = CopilotStudioWebChat.createConnection(shared)
      const subscription = connection.activity$.subscribe()
      try {
        await responses[0].reading.promise
        await shared.startConversationWithResponse()
        responses[0].finish.resolve()
        await firstValueFrom(connection.connectionStatus$.pipe(filter(status => status === 2)))
        await new Promise<void>((resolve, reject) => {
          connection.postActivity(Activity.fromObject({
            type: 'message',
            text: 'Follow-up',
            ...(activityId !== undefined && { conversation: { id: activityId } })
          })).subscribe({ complete: resolve, error: reject })
        })
        const expectedId = activityId?.trim() || ''
        const call = fetchMock.mock.calls[2]
        assert.equal(new URL(String(call.arguments[0])).pathname, `/api/conversations${expectedId ? '/' + expectedId : ''}`)
        const body = JSON.parse(String(call.arguments[1]?.body))
        assert.equal(body.activity.conversation.id, expectedId)
      } finally {
        responses[0].finish.resolve()
        connection.end()
        subscription.unsubscribe()
      }
    })
  }

  it('queues a send triggered synchronously by the first typing notification', async (t) => {
    const startup = startResponse('A')
    const turn = startResponse('A')
    turn.finish.resolve()
    let requests = 0
    t.mock.method(globalThis, 'fetch', async () => ++requests === 1 ? startup.response : turn.response)
    const connection = CopilotStudioWebChat.createConnection(client(), { showTyping: true })
    let posted: Promise<void> | undefined
    let postError: unknown
    const subscription = connection.activity$.subscribe(activity => {
      if (activity.type === 'typing' && !posted) {
        posted = new Promise<void>((resolve) => {
          connection.postActivity(Activity.fromObject({ type: 'message', text: 'A' })).subscribe({
            complete: resolve,
            error: error => {
              postError = error
              resolve()
            }
          })
        })
      }
    })
    try {
      await new Promise<void>((resolve) => setImmediate(resolve))
      assert.ok(posted)
      assert.equal(postError, undefined)
      assert.equal(requests, 1)
      startup.finish.resolve()
      await posted
      assert.equal(postError, undefined)
      assert.equal(requests, 2)
    } finally {
      startup.finish.resolve()
      await Promise.allSettled(posted ? [posted] : [])
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('routes an activity with a whitespace ID using the configured resume ID', async (t) => {
    const response = startResponse('A')
    response.finish.resolve()
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => response.response)
    const connection = CopilotStudioWebChat.createConnection(client(), { conversationId: 'A' })
    const subscription = connection.activity$.subscribe()
    try {
      await new Promise<void>((resolve, reject) => {
        connection.postActivity(Activity.fromObject({ type: 'message', text: 'A', conversation: { id: ' ' } })).subscribe({ complete: resolve, error: reject })
      })
      assert.match(String(fetchMock.mock.calls[0].arguments[0]), /\/conversations\/A\?/)
      const payload = JSON.parse(String(fetchMock.mock.calls[0].arguments[1]?.body))
      assert.equal(payload.activity.conversation.id, 'A')
    } finally {
      connection.end()
      subscription.unsubscribe()
    }
  })

  it('isolates two WebChat connections with header-only starts', async (t) => {
    const destinations: string[] = []
    let starts = 0
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body))
      const id = request.activity ? new URL(String(url)).pathname.split('/').at(-1)! : `conversation-${++starts}`
      const response = startResponse(id, request.activity && { type: 'message', text: 'echo', conversation: { id } })
      response.finish.resolve()
      if (request.activity) {
        destinations.push(id)
      }
      return response.response
    })
    const shared = client()
    const a = CopilotStudioWebChat.createConnection(shared)
    const b = CopilotStudioWebChat.createConnection(shared)
    const subscriptions = [a.activity$.subscribe(), b.activity$.subscribe()]
    try {
      await Promise.all([a, b].map(connection => firstValueFrom(connection.connectionStatus$.pipe(filter(status => status === 2)))))
      await new Promise<void>((resolve, reject) => {
        a.postActivity(Activity.fromObject({ type: 'message', text: 'A' })).subscribe({ complete: resolve, error: reject })
      })
      await new Promise<void>((resolve, reject) => {
        b.postActivity(Activity.fromObject({ type: 'message', text: 'B' })).subscribe({ complete: resolve, error: reject })
      })
      assert.equal(a.conversationId, 'conversation-1')
      assert.equal(b.conversationId, 'conversation-2')
      assert.deepEqual(destinations, ['conversation-1', 'conversation-2'])
    } finally {
      a.end()
      b.end()
      subscriptions.forEach(subscription => subscription.unsubscribe())
    }
  })
})
