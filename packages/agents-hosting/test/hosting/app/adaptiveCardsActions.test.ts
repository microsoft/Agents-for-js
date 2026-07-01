import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { ACTION_INVOKE_NAME, AgentApplication, RouteSelector, TurnContext, TurnState } from '../../../src'
import { TestAdapter } from '../testStubs'

function createActionExecuteContext (verb: string, data: Record<string, unknown> = {}) {
  const activity = Activity.fromObject({
    type: ActivityTypes.Invoke,
    name: ACTION_INVOKE_NAME,
    channelId: 'test',
    serviceUrl: 'https://service.example',
    conversation: { id: 'conversation-id' },
    recipient: { id: 'recipient-id' },
    from: { id: 'from-id' },
    value: {
      action: {
        type: 'Action.Execute',
        verb,
        data
      }
    }
  })

  return new TurnContext(new TestAdapter(), activity)
}

describe('AdaptiveCardsActions', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('passes the parsed Action.Execute payload to the handler', async () => {
    const app = new AgentApplication<TurnState>()
    let receivedAction: any

    app.adaptiveCards.actionExecute('doStuff', async (_context, _state, action) => {
      receivedAction = action
      return 'ok'
    })

    const handled = await app.runInternal(createActionExecuteContext('doStuff', { foo: 'bar' }))

    assert.equal(handled, true)
    assert.equal(receivedAction.type, 'Action.Execute')
    assert.equal(receivedAction.verb, 'doStuff')
    assert.deepEqual(receivedAction.data, { foo: 'bar' })
  })

  it('does not log a false mismatch for RegExp verbs', async () => {
    const app = new AgentApplication<TurnState>()
    const consoleLogStub = sinon.stub(console, 'log')

    app.adaptiveCards.actionExecute(/^do/, async () => 'ok')

    const handled = await app.runInternal(createActionExecuteContext('doStuff'))

    assert.equal(handled, true)
    sinon.assert.notCalled(consoleLogStub)
  })

  it('does not log a false mismatch for custom selectors', async () => {
    const app = new AgentApplication<TurnState>()
    const consoleLogStub = sinon.stub(console, 'log')
    const selector: RouteSelector = (context) => {
      return Promise.resolve((context.activity.value as any)?.action?.verb === 'doStuff')
    }

    app.adaptiveCards.actionExecute(selector, async () => 'ok')

    const handled = await app.runInternal(createActionExecuteContext('doStuff'))

    assert.equal(handled, true)
    sinon.assert.notCalled(consoleLogStub)
  })
})
