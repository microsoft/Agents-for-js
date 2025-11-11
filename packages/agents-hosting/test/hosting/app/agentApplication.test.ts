import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'

import { AgentApplication } from './../../../src/app'
import { TestAdapter } from '../testStubs'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { MessageFactory } from '../../../src/messageFactory'
import { TurnContext } from '../../../src/turnContext'
import { RouteList } from './../../../src/app/routeList'
import { TurnState } from './../../../src/app/turnState'
import { RouteRank } from './../../../src/app/routeRank'
import { CloudAdapter } from '../../../src/cloudAdapter'
import { createStubInstance, SinonStub } from 'sinon'
import { ConsoleTranscriptLogger } from '../../../src/transcript/consoleTranscriptLogger'

const createTestActivity = () => Activity.fromObject({
  type: 'message',
  from: {
    id: 'test',
    name: 'test'
  },
  conversation: {
    id: 'test'
  },
  channelId: 'test',
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
    await app.run(context)
    await context.sendActivity('test')
    assert.equal(called, true)
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
    await app.run(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
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
    await app.run(context)
    await context.sendActivity(testActivity)
    assert.equal(called, false)
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
    await app.run(context)
    await context.sendActivity(testActivity)
    assert.equal(called, true)
  })

  it('should route to a act handler with regex', async () => {
    let called = false

    app.onActivity(/^message/, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    await app.run(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
  })

  it('should route to a msg handler with regex', async () => {
    let called = false

    app.onMessage(/^\/yo/, async (context, state) => {
      assert.notEqual(context, undefined)
      assert.notEqual(state, undefined)
      called = true
    })
    const context = new TurnContext(testAdapter, testActivity)
    await app.run(context)
    await context.sendActivity(MessageFactory.text('/yo'))
    assert.equal(called, true)
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
    await app.run(context)
    await context.sendActivity('/yo')
    assert.equal(timesCalled, 1)
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
    await app.run(context)
    await context.sendActivity('/yo')
    assert.equal(timesCalled, 1)
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
