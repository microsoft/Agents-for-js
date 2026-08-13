import { strict as assert } from 'assert'
import { describe, it } from 'node:test'

import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication } from '../../src/app'
import { TurnContext } from '../../src/turnContext'
import { TestAdapter } from '../hosting/testStubs'

const createInvokeActivity = (name: string, value: unknown) => Activity.fromObject({
  type: ActivityTypes.Invoke,
  name,
  from: { id: 'test', name: 'test' },
  conversation: { id: 'test' },
  recipient: { id: 'test' },
  channelId: 'test',
  serviceUrl: 'test',
  value
})

describe('AdaptiveCardsActions', () => {
  it('should not throw when actionExecute selector sees malformed invoke value', async () => {
    const app = new AgentApplication()
    let called = false

    app.adaptiveCards.actionExecute('expectedVerb', async () => {
      called = true
      return 'ok'
    })

    const activity = createInvokeActivity('adaptiveCard/action', {
      action: {
        type: 'Action.Execute',
        verb: 1
      }
    })
    const context = new TurnContext(new TestAdapter(), activity)
    const handled = await app.runInternal(context)

    assert.equal(called, false)
    assert.equal(handled, false)
  })

  it('should not parse unrelated invoke values in actionExecute selector', async () => {
    const app = new AgentApplication()
    let called = false

    app.adaptiveCards.actionExecute('expectedVerb', async () => {
      called = true
      return 'ok'
    })

    const activity = createInvokeActivity('signin/verifyState', {
      action: {
        type: 1,
        verb: 'expectedVerb'
      }
    })
    const context = new TurnContext(new TestAdapter(), activity)
    const handled = await app.runInternal(context)

    assert.equal(called, false)
    assert.equal(handled, false)
  })
})
