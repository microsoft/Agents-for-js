import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import * as sinon from 'sinon'

import { AgentApplication } from './../../../src/app'
import { TestAdapter } from '../testStubs'
import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'
import { MessageFactory } from '../../../src/messageFactory'
import { TurnContext } from '../../../src/turnContext'
import { RouteList } from './../../../src/app/routeList'
import { TurnState } from './../../../src/app/turnState'
import { RouteRank } from './../../../src/app/routeRank'
import { CloudAdapter } from '../../../src/cloudAdapter'
import { createStubInstance, SinonStub } from 'sinon'
import { ConsoleTranscriptLogger } from '../../../src/transcript/consoleTranscriptLogger'

class RecordingTestAdapter extends TestAdapter {
  public readonly sentActivities: Activity[] = []

  async sendActivities (context: TurnContext, activities: Activity[]): Promise<any[]> {
    this.sentActivities.push(...activities.map(activity => Activity.fromObject(activity)))
    return await super.sendActivities(context, activities)
  }
}

const createTestActivity = (channelId: string = 'test') => Activity.fromObject({
  type: 'message',
  from: {
    id: 'test',
    name: 'test'
  },
  conversation: {
    id: 'test'
  },
  channelId,
  recipient: {
    id: 'test'
  },
  serviceUrl: 'test',
  text: '/yo'
})

describe('Application', () => {
  let app = new AgentApplication()
  let testActivity: Activity = createTestActivity()
  const testAdapter = new TestAdapter()

  beforeEach(() => {
    app = new AgentApplication()
    testActivity = createTestActivity()
  })
  it('should create an Application with default options', () => {
    const app = new AgentApplication()
    assert.notEqual(app.options, undefined)
    assert.equal(app.options.adapter, undefined)
    assert.equal(app.options.storage, undefined)
    assert.equal(app.options.authorization, undefined)
    assert.equal(app.options.startTypingTimer, false)
    assert.equal(app.options.transcriptLogger, undefined)
  })

  it('should route to an activity handler', async () => {
    let called = false

    app.onActivity(ActivityTypes.Message, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity('test')
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should route to an agentic activity handler', async () => {
    let called = false

    app.onActivity(ActivityTypes.Message, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    }, [], undefined, true) // isAgenticRoute is true
    const agenticActivity = Activity.fromObject({
      type: 'message',
      from: { id: 'test', name: 'test' },
      conversation: { id: 'test' },
      recipient: { id: 'recipientId', role: 'agenticUser' },
      text: 'test',
      channelId: 'test'
    })
    const context = new TurnContext(testAdapter, agenticActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(agenticActivity)
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should route to a message handler with string', async () => {
    let called = false

    app.onMessage('/yo', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should route to an agentic message handler with string', async () => {
    let called = false

    app.onMessage('/yo', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    }, [], undefined, true) // isAgenticRoute is true
    const agenticActivity = Activity.fromObject({
      type: 'message',
      from: { id: 'test', name: 'test' },
      conversation: { id: 'test' },
      recipient: { id: 'recipientId', role: 'agenticUser' },
      text: '/yo',
      channelId: 'test'
    })
    const context = new TurnContext(testAdapter, agenticActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(agenticActivity)
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should not route to a message handler with partial string', async () => {
    let called = false

    app.onMessage('fooBar', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    testActivity.text = 'foo'
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(testActivity)
    assert.equal(called, false)
    assert.equal(handled, false)
  })

  it('should route to a message handler with string case insensitive', async () => {
    let called = false

    app.onMessage('foo', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    testActivity.text = 'FOO'
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(testActivity)
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should route to a act handler with regex', async () => {
    let called = false

    app.onActivity(/^message/, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should route to a msg handler with regex', async () => {
    let called = false

    app.onMessage(/^\/yo/, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
    assert.equal(handled, true)
  })

  it('should ignore sencond message', async () => {
    let timesCalled = 0

    app.onMessage('/yo', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      timesCalled++
    })
    app.onMessage('/yo', async (context2, state2) => {
      assert.notEqual(context2, undefined)
      assert.notEqual(state2, undefined)
      timesCalled++
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity('/yo')
    assert.equal(timesCalled, 1)
    assert.equal(handled, true)
  })

  it('should ignore sencond message with act', async () => {
    let timesCalled = 0

    app.onMessage('/yo', async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      timesCalled++
    })
    app.onActivity(ActivityTypes.Message, async (context2, state2) => {
      assert.notEqual(context2, undefined)
      assert.notEqual(state2, undefined)
      timesCalled++
    })
    const context = new TurnContext(testAdapter, testActivity)
    const handled = await app.runInternal(context)
    await context.sendActivity('/yo')
    assert.equal(timesCalled, 1)
    assert.equal(handled, true)
  })

  it('should add TranscriptLoggerMiddleware', async () => {
    const logger = new ConsoleTranscriptLogger()
    const adapter: CloudAdapter = createStubInstance(CloudAdapter)

    const app = new AgentApplication({ adapter, transcriptLogger: logger })

    assert.notEqual(app.adapter, undefined)
    const useStub = adapter.use as SinonStub
    assert.equal(useStub.calledOnce, true)
    const calledWith = useStub.getCall(0).args[0]
    assert.equal(calledWith.constructor.name, 'TranscriptLoggerMiddleware')
  })

  it('should throw for transcriptLogger when no adapter is provided', async () => {
    const logger = new ConsoleTranscriptLogger()

    assert.throws(() => new AgentApplication({ transcriptLogger: logger }))
  })

  describe('typing timer', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
      clock = sinon.useFakeTimers()
    })

    afterEach(() => {
      clock.restore()
      sinon.restore()
    })

    it('should start a separate typing timer for each turn context', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const firstContext = new TurnContext(adapter, createTestActivity())
      const secondContext = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(firstContext)
      app.startTypingTimer(secondContext)

      await clock.tickAsync(1000)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 2)
    })

    it('should send the first typing indicator immediately', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)

      await clock.tickAsync(0)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 1)
    })

    it('should honor a configured initial delay before the first typing indicator', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({
        startTypingTimer: true,
        typing: {
          initialDelayMs: 250,
          intervalMs: 1000
        }
      })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)

      await clock.tickAsync(249)
      assert.equal(adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing).length, 0)

      await clock.tickAsync(1)
      assert.equal(adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing).length, 1)
    })

    it('should not mark the turn as responded when automatic typing is sent', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)

      await clock.tickAsync(0)

      assert.equal(context.responded, false)
    })

    it('should not start the timer for non-message activities', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const invokeActivity = Activity.fromObject({
        type: ActivityTypes.Invoke,
        name: 'testInvoke',
        from: { id: 'test', name: 'test' },
        conversation: { id: 'test' },
        recipient: { id: 'test' },
        channelId: 'test',
        serviceUrl: 'test'
      })
      const context = new TurnContext(adapter, invokeActivity)

      app.startTypingTimer(context)

      await clock.tickAsync(0)
      await clock.tickAsync(5000)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 0)
    })

    it('should stop the timer when context is provided', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)
      app.stopTypingTimer(context)

      await clock.tickAsync(1000)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 0)
    })

    it('should keep the timer running when stopTypingTimer is called without context', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)
      app.stopTypingTimer()

      await clock.tickAsync(1000)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 1)
    })

    it('should stop future typing sends after a real message is sent', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)

      await clock.tickAsync(0)
      await context.sendActivity('done')
      await clock.tickAsync(5000)

      const typingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing)

      assert.equal(typingActivities.length, 1)
    })

    it('should stop future automatic typing sends after a streamed typing activity is sent', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({ startTypingTimer: true })
      const context = new TurnContext(adapter, createTestActivity())

      app.startTypingTimer(context)

      await clock.tickAsync(0)
      await context.sendActivity(Activity.fromObject({
        type: ActivityTypes.Typing,
        entities: [{
          type: 'streaminfo',
          streamType: 'streaming'
        }]
      }))
      await clock.tickAsync(5000)

      const automaticTypingActivities = adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing && !activity.entities?.some(entity => entity.type === 'streaminfo'))

      assert.equal(automaticTypingActivities.length, 1)
    })

    it('should honor channel-specific typing overrides', async () => {
      const adapter = new RecordingTestAdapter()
      const app = new AgentApplication({
        startTypingTimer: true,
        typing: {
          initialDelayMs: 500,
          intervalMs: 4000,
          channelStrategies: {
            [Channels.M365Copilot]: {
              initialDelayMs: 50,
              intervalMs: 1000
            }
          }
        }
      })
      const context = new TurnContext(adapter, createTestActivity(Channels.M365Copilot))

      app.startTypingTimer(context)

      await clock.tickAsync(49)
      assert.equal(adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing).length, 0)

      await clock.tickAsync(1)
      assert.equal(adapter.sentActivities.filter(activity => activity.type === ActivityTypes.Typing).length, 1)
    })
  })

  describe('signin/tokenExchange detaching', () => {
    class TrackingAdapter extends TestAdapter {
      continueConversationCalled = false
      continueConversationCallback: ((ctx: TurnContext) => Promise<void>) | undefined

      override continueConversation (_identity: any, _reference: any, logic: (ctx: TurnContext) => Promise<void>): Promise<void> {
        this.continueConversationCalled = true
        this.continueConversationCallback = logic
        return Promise.resolve()
      }
    }

    const createTokenExchangeActivity = () => Activity.fromObject({
      type: ActivityTypes.Invoke,
      name: 'signin/tokenExchange',
      from: { id: 'user', name: 'user' },
      conversation: { id: 'conv' },
      channelId: 'test',
      recipient: { id: 'bot' },
      serviceUrl: 'https://test.example',
      value: { token: 'mytoken', id: 'exchangeId' }
    })

    it('should detach signin/tokenExchange and return true immediately', async () => {
      const trackingAdapter = new TrackingAdapter()
      const localApp = new AgentApplication({ adapter: trackingAdapter as any })
      let handlerCalled = false

      localApp.onActivity(ActivityTypes.Message, async (_ctx, _state) => {
        handlerCalled = true
      })

      const activity = createTokenExchangeActivity()
      const context = new TurnContext(trackingAdapter, activity)
      const handled = await localApp.runInternal(context)

      assert.equal(handled, true, 'runInternal should return true for tokenExchange')
      assert.equal(trackingAdapter.continueConversationCalled, true, 'continueConversationAsync should be called')
      assert.equal(handlerCalled, false, 'turn handler should not be called synchronously')
    })

    it('should execute the turn handler in the detached continuation', async () => {
      const trackingAdapter = new TrackingAdapter()
      const localApp = new AgentApplication({ adapter: trackingAdapter as any })
      let handlerCalled = false
      let handlerActivityType: string | undefined

      // The continuation re-uses the original signin/tokenExchange activity (via Object.assign),
      // so the handler should be called with the invoke activity type.
      localApp.onActivity(ActivityTypes.Invoke, async (ctx, _state) => {
        handlerCalled = true
        handlerActivityType = ctx.activity.type
      })

      const activity = createTokenExchangeActivity()
      const context = new TurnContext(trackingAdapter, activity)
      await localApp.runInternal(context)

      assert.equal(trackingAdapter.continueConversationCalled, true)
      // Execute the continuation synchronously to verify the handler is eventually called
      if (trackingAdapter.continueConversationCallback) {
        // The continuation context activity will be overwritten by the original tokenExchange activity
        const continuationCtx = new TurnContext(trackingAdapter, Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'placeholder',
          from: { id: 'user', name: 'user' },
          conversation: { id: 'conv' },
          channelId: 'test',
          recipient: { id: 'bot' },
          serviceUrl: 'https://test.example'
        }))
        await trackingAdapter.continueConversationCallback(continuationCtx)
      }
      assert.equal(handlerCalled, true, 'invoke handler should be called in the continuation')
      assert.equal(handlerActivityType, ActivityTypes.Invoke, 'handler should receive the original invoke activity type')
    })

    it('should not detach regular message activities', async () => {
      const trackingAdapter = new TrackingAdapter()
      const localApp = new AgentApplication({ adapter: trackingAdapter as any })
      let handlerCalled = false

      localApp.onActivity(ActivityTypes.Message, async (_ctx, _state) => {
        handlerCalled = true
      })

      const context = new TurnContext(trackingAdapter, testActivity)
      const handled = await localApp.runInternal(context)

      assert.equal(handled, true)
      assert.equal(trackingAdapter.continueConversationCalled, false, 'continueConversation should not be called for message activities')
      assert.equal(handlerCalled, true, 'handler should be called synchronously for messages')
    })

    it('should call continueConversationAsync for longRunningMessages option', async () => {
      const trackingAdapter = new TrackingAdapter()
      const localApp = new AgentApplication({ adapter: trackingAdapter as any, longRunningMessages: true })

      const context = new TurnContext(trackingAdapter, testActivity)
      const handled = await localApp.runInternal(context)

      assert.equal(handled, true)
      assert.equal(trackingAdapter.continueConversationCalled, true, 'continueConversation should be called for longRunningMessages')
    })
  })
})

describe('RouteList', () => {
  it('should order by rank', async () => {
    const values: string[] = []
    const routeList: RouteList<TurnState> = new RouteList()

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('1')
        return new Promise<void>(resolve => resolve())
      },
      false,
      2
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('2')
        return new Promise<void>(resolve => resolve())
      },
      false,
      0
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('3')
        return new Promise<void>(resolve => resolve())
      },
      false,
      1
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('4')
        return new Promise<void>(resolve => resolve())
      },
      false,
      1
    )

    for (const route of routeList) {
      await route.handler({} as any, {} as any)
    }

    assert.equal(4, values.length)
    assert.equal('2', values[0])
    assert.equal('3', values[1])
    assert.equal('4', values[2])
    assert.equal('1', values[3])
  })

  it('should order by invoke then by order of addition', async () => {
    const values: string[] = []
    const routeList: RouteList<TurnState> = new RouteList()

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('2')
        return new Promise<void>(resolve => resolve())
      },
      false
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('1')
        return new Promise<void>(resolve => resolve())
      },
      false
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('invoke')
        return new Promise<void>(resolve => resolve())
      },
      true
    )

    for (const route of routeList) {
      await route.handler({} as any, {} as any)
    }

    assert.equal(3, values.length)
    assert.equal('invoke', values[0])
    assert.equal('2', values[1])
    assert.equal('1', values[2])
  })

  it('should order by invoke then by rank', async () => {
    const values: string[] = []
    const routeList: RouteList<TurnState> = new RouteList()

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('2')
        return new Promise<void>(resolve => resolve())
      },
      false,
      RouteRank.Unspecified
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('1')
        return new Promise<void>(resolve => resolve())
      },
      false,
      0
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('invoke1')
        return new Promise<void>(resolve => resolve())
      },
      true,
      RouteRank.Last
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('invoke2')
        return new Promise<void>(resolve => resolve())
      },
      true,
      0
    )

    for (const route of routeList) {
      await route.handler({} as any, {} as any)
    }

    assert.equal(4, values.length)
    assert.equal('invoke2', values[0])
    assert.equal('invoke1', values[1])
    assert.equal('1', values[2])
    assert.equal('2', values[3])
  })

  it('should order by agentic, then invoke, then by rank', async () => {
    const values: string[] = []
    const routeList: RouteList<TurnState> = new RouteList()

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('2')
        return new Promise<void>(resolve => resolve())
      },
      false
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('1')
        return new Promise<void>(resolve => resolve())
      },
      false
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('3')
        return new Promise<void>(resolve => resolve())
      },
      false,
      RouteRank.First
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('invoke')
        return new Promise<void>(resolve => resolve())
      },
      true
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('agenticInvoke2')
        return new Promise<void>(resolve => resolve())
      },
      true,
      undefined,
      undefined,
      true
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('agenticInvoke1')
        return new Promise<void>(resolve => resolve())
      },
      true,
      RouteRank.First,
      undefined,
      true
    )

    routeList.addRoute(
      () => { return new Promise<true>(resolve => resolve(true)) },
      () => {
        values.push('agentic')
        return new Promise<void>(resolve => resolve())
      },
      false,
      undefined,
      undefined,
      true
    )

    for (const route of routeList) {
      await route.handler({} as any, {} as any)
    }

    assert.equal(7, values.length)
    assert.equal('agenticInvoke1', values[0])
    assert.equal('agenticInvoke2', values[1])
    assert.equal('invoke', values[2])
    assert.equal('agentic', values[3])
    assert.equal('3', values[4])
    assert.equal('2', values[5])
    assert.equal('1', values[6])
  })
})
