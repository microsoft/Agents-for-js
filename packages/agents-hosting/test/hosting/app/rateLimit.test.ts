import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import * as sinon from 'sinon'

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, INVOKE_RESPONSE_KEY, StatusCodes, Storage, StoreItem, TurnContext } from '../../../src'
import { TestAdapter } from '../testStubs'

class RecordingTestAdapter extends TestAdapter {
  public readonly sentActivities: Activity[] = []

  async sendActivities (context: TurnContext, activities: Activity[]): Promise<any[]> {
    this.sentActivities.push(...activities.map(activity => Activity.fromObject(activity)))
    return await super.sendActivities(context, activities)
  }
}

class ThrowingStorage implements Storage {
  async read (_keys: string[]): Promise<StoreItem> {
    throw new Error('storage failed')
  }

  async write (_changes: StoreItem): Promise<void> {
    throw new Error('storage failed')
  }

  async delete (_keys: string[]): Promise<void> {
    throw new Error('storage failed')
  }
}

class RecordingStorage implements Storage {
  public readonly readKeys: string[] = []
  public readonly writeKeys: string[] = []
  private readonly items: StoreItem = {}

  async read (keys: string[]): Promise<StoreItem> {
    this.readKeys.push(...keys)
    const result: StoreItem = {}
    for (const key of keys) {
      if (this.items[key]) {
        result[key] = this.items[key]
      }
    }
    return result
  }

  async write (changes: StoreItem): Promise<void> {
    this.writeKeys.push(...Object.keys(changes))
    Object.assign(this.items, changes)
  }

  async delete (keys: string[]): Promise<void> {
    for (const key of keys) {
      delete this.items[key]
    }
  }

  getItem<T = StoreItem> (key: string): T | undefined {
    return this.items[key] as T | undefined
  }
}

class FailsOnceForKeyStorage implements Storage {
  private readonly items: StoreItem = {}
  private hasFailed = false

  constructor (private readonly failingKey: string) {}

  async read (keys: string[]): Promise<StoreItem> {
    const result: StoreItem = {}
    for (const key of keys) {
      if (this.items[key]) {
        result[key] = this.items[key]
      }
    }
    return result
  }

  async write (changes: StoreItem): Promise<void> {
    const key = Object.keys(changes)[0]
    if (key === this.failingKey && !this.hasFailed) {
      this.hasFailed = true
      throw new Error('transient conflict')
    }

    Object.assign(this.items, changes)
  }

  async delete (keys: string[]): Promise<void> {
    for (const key of keys) {
      delete this.items[key]
    }
  }

  getItem<T = StoreItem> (key: string): T | undefined {
    return this.items[key] as T | undefined
  }
}

const createTestActivity = () => Activity.fromObject({
  type: ActivityTypes.Message,
  from: {
    id: 'user-1',
    name: 'Test User'
  },
  conversation: {
    id: 'conversation-1'
  },
  channelId: 'test',
  recipient: {
    id: 'agent'
  },
  serviceUrl: 'https://service.example',
  text: 'hello'
})

describe('AgentApplication rate limiting', () => {
  it('should not rate limit when rateLimit is omitted', async () => {
    let called = 0
    const app = new AgentApplication()
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(called, 2)
  })

  it('should not rate limit when rateLimit is empty', async () => {
    let called = 0
    const app = new AgentApplication({ rateLimit: [] })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(called, 2)
  })

  it('should throttle a turn when a user rule is exceeded', async () => {
    let called = 0
    const adapter = new RecordingTestAdapter()
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        activityTypes: [ActivityTypes.Message],
        limit: 1,
        windowMs: 60_000,
        message: 'Slow down.'
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(adapter, createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(adapter, createTestActivity())), false)
    assert.equal(called, 1)
    assert.equal(adapter.sentActivities.length, 1)
    assert.equal(adapter.sentActivities[0].text, 'Slow down.')
  })

  it('should not allow concurrent first turns to bypass a new counter limit', async () => {
    let called = 0
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    const results = await Promise.all([
      app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())),
      app.runInternal(new TurnContext(new TestAdapter(), createTestActivity()))
    ])

    assert.equal(results.filter(Boolean).length, 1)
    assert.equal(called, 1)
  })

  it('should reset fixed windows over time', async () => {
    const clock = sinon.useFakeTimers()
    try {
      let called = 0
      const app = new AgentApplication({
        rateLimit: [{
          scope: context => context.activity.from?.id,
          limit: 1,
          windowMs: 1000
        }]
      })
      app.onActivity(ActivityTypes.Message, async () => {
        called++
      })

      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), false)
      await clock.tickAsync(1000)
      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
      assert.equal(called, 2)
    } finally {
      clock.restore()
    }
  })

  it('should report retryAfterMs as time remaining in fixed window', async () => {
    const clock = sinon.useFakeTimers()
    try {
      let retryAfterMs = 0
      const app = new AgentApplication({
        rateLimit: [{
          scope: context => context.activity.from?.id,
          limit: 3,
          windowMs: 10_000,
          message: (_context, result) => {
            retryAfterMs = result.retryAfterMs
            return 'Slow down.'
          }
        }]
      })
      app.onActivity(ActivityTypes.Message, async () => {})

      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
      assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
      await clock.tickAsync(1000)
      assert.equal(await app.runInternal(new TurnContext(new RecordingTestAdapter(), createTestActivity())), false)
      assert.equal(retryAfterMs, 9000)
    } finally {
      clock.restore()
    }
  })

  it('should evaluate multiple rules in order and keep rule windows independent', async () => {
    let called = 0
    const adapter = new RecordingTestAdapter()
    const app = new AgentApplication({
      rateLimit: [
        {
          scope: context => context.activity.from?.id,
          activityTypes: [ActivityTypes.Message],
          limit: 100,
          windowMs: 60_000,
          message: 'User limited.'
        },
        {
          scope: context => context.activity.conversation?.id,
          limit: 1,
          windowMs: 60_000,
          message: 'Conversation limited.'
        }
      ]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(adapter, createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(adapter, createTestActivity())), false)
    assert.equal(called, 1)
    assert.equal(adapter.sentActivities[0].text, 'Conversation limited.')
  })

  it('should not persist pending window updates when a later rule throttles', async () => {
    const storage = new RecordingStorage()
    const app = new AgentApplication({
      storage,
      rateLimit: [
        {
          scope: context => context.activity.from?.id,
          limit: 10,
          windowMs: 60_000
        },
        {
          scope: context => context.activity.conversation?.id,
          limit: 1,
          windowMs: 60_000
        }
      ]
    })
    app.onActivity(ActivityTypes.Message, async () => {})

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), false)
    assert.equal(storage.getItem<{ count: number }>('rateLimit:0:user-1')?.count, 1)
  })

  it('should not retry counter writes that already committed for the same turn', async () => {
    const storage = new FailsOnceForKeyStorage('rateLimit:1:conversation-1')
    const app = new AgentApplication({
      storage,
      rateLimit: [
        {
          scope: context => context.activity.from?.id,
          limit: 10,
          windowMs: 60_000
        },
        {
          scope: context => context.activity.conversation?.id,
          limit: 10,
          windowMs: 60_000
        }
      ]
    })
    app.onActivity(ActivityTypes.Message, async () => {})

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(storage.getItem<{ count: number }>('rateLimit:0:user-1')?.count, 1)
    assert.equal(storage.getItem<{ count: number }>('rateLimit:1:conversation-1')?.count, 1)
  })

  it('should support a custom scope key and appliesTo predicate', async () => {
    let called = 0
    const adapter = new RecordingTestAdapter()
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => `tenant:${context.activity.channelData.tenantId}`,
        appliesTo: context => context.activity.channelData.rateLimit === true,
        limit: 1,
        windowMs: 60_000
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    const skipped = createTestActivity()
    skipped.channelData = { tenantId: 'a', rateLimit: false }
    const counted = createTestActivity()
    counted.channelData = { tenantId: 'a', rateLimit: true }

    assert.equal(await app.runInternal(new TurnContext(adapter, skipped)), true)
    assert.equal(await app.runInternal(new TurnContext(adapter, counted)), true)
    assert.equal(await app.runInternal(new TurnContext(adapter, counted)), false)
    assert.equal(called, 2)
  })

  it('should support userAndConversation scope', async () => {
    let called = 0
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => {
          const userId = context.activity.from?.id
          const conversationId = context.activity.conversation?.id
          return userId && conversationId ? `${userId}:${conversationId}` : undefined
        },
        limit: 1,
        windowMs: 60_000
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    const sameUserSameConversation = createTestActivity()
    const sameUserDifferentConversation = createTestActivity()
    sameUserDifferentConversation.conversation!.id = 'conversation-2'

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), sameUserSameConversation)), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), sameUserSameConversation)), false)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), sameUserDifferentConversation)), true)
    assert.equal(called, 2)
  })

  it('should use application storage when rule storage is omitted', async () => {
    const storage = new RecordingStorage()
    const app = new AgentApplication({
      storage,
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {})

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), false)
    assert.equal(storage.readKeys.filter(key => key.startsWith('rateLimit:')).length, 2)
    assert.equal(storage.writeKeys.filter(key => key.startsWith('rateLimit:')).length, 1)
  })

  it('should prefer rule storage over application storage', async () => {
    const appStorage = new RecordingStorage()
    const ruleStorage = new RecordingStorage()
    const app = new AgentApplication({
      storage: appStorage,
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000,
        storage: ruleStorage
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {})

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), false)
    assert.equal(appStorage.readKeys.filter(key => key.startsWith('rateLimit:')).length, 0)
    assert.equal(appStorage.writeKeys.filter(key => key.startsWith('rateLimit:')).length, 0)
    assert.equal(ruleStorage.readKeys.filter(key => key.startsWith('rateLimit:')).length, 2)
    assert.equal(ruleStorage.writeKeys.filter(key => key.startsWith('rateLimit:')).length, 1)
  })

  it('should throttle when the configured scope key cannot be derived', async () => {
    let called = 0
    const adapter = new RecordingTestAdapter()
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    const activity = createTestActivity()
    activity.from = undefined

    assert.equal(await app.runInternal(new TurnContext(adapter, activity)), false)
    assert.equal(called, 0)
    assert.equal(adapter.sentActivities[0].text, 'Too many requests. Please try again later.')
  })

  it('should set a 429 invoke response when an invoke activity is throttled', async () => {
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.conversation?.id,
        limit: 1,
        windowMs: 60_000,
        message: 'Invoke limited.'
      }]
    })
    const activity = createTestActivity()
    activity.type = ActivityTypes.Invoke
    const allowedContext = new TurnContext(new TestAdapter(), activity)
    const throttledContext = new TurnContext(new TestAdapter(), activity)

    assert.equal(await app.runInternal(allowedContext), false)
    assert.equal(await app.runInternal(throttledContext), false)
    const invokeResponse = throttledContext.turnState.get<any>(INVOKE_RESPONSE_KEY)
    assert.equal(invokeResponse.value.status, StatusCodes.TOO_MANY_REQUESTS)
    assert.equal(invokeResponse.value.body.message, 'Invoke limited.')
  })

  it('should allow turns when storage fails and storageErrorBehavior is allow', async () => {
    let called = 0
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000,
        storageErrorBehavior: 'allow',
        storage: new ThrowingStorage()
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())), true)
    assert.equal(called, 1)
  })

  it('should throttle turns when storage fails and storageErrorBehavior is throttle', async () => {
    let called = 0
    const adapter = new RecordingTestAdapter()
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000,
        storage: new ThrowingStorage()
      }]
    })
    app.onActivity(ActivityTypes.Message, async () => {
      called++
    })

    assert.equal(await app.runInternal(new TurnContext(adapter, createTestActivity())), false)
    assert.equal(called, 0)
    assert.equal(adapter.sentActivities[0].text, 'Too many requests. Please try again later.')
  })

  it('should throw when storage fails and storageErrorBehavior is throw', async () => {
    const app = new AgentApplication({
      rateLimit: [{
        scope: context => context.activity.from?.id,
        limit: 1,
        windowMs: 60_000,
        storageErrorBehavior: 'throw',
        storage: new ThrowingStorage()
      }]
    })

    await assert.rejects(
      async () => await app.runInternal(new TurnContext(new TestAdapter(), createTestActivity())),
      /storage failed/
    )
  })
})
