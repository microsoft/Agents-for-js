import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { TurnState } from '../../../src/app/turnState'
import { TurnStateProperty } from '../../../src/app/turnStateProperty'
import { Activity } from '@microsoft/agents-activity'
import { TestAdapter } from '../testStubs'
import { TurnContext } from '../../../src/turnContext'

const testActivity = Activity.fromObject({
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
  }
})

describe('TurnStateProperty', () => {
  let context: TurnContext
  let state: TurnState
  beforeEach(async () => {
    context = new TurnContext(new TestAdapter(), testActivity)
    state = new TurnState()
    await state.load(context)
  })
  // Reset the TurnState instance before each test

  it('should throw an error when TurnState is missing state scope named scope', () => {
    const state = new TurnState()
    const scopeName = 'scope'
    const propertyName = 'propertyName'
    const createTurnStateProperty = () => {
      const res = new TurnStateProperty(state, scopeName, propertyName)
      return res
    }
    assert.throws(createTurnStateProperty, 'TurnStateProperty: TurnState missing state scope named "scope".')
  })

  it('should set the turn state property', async () => {
    const propertyName = 'tempStateProperty'
    const turnStateProperty = new TurnStateProperty(state, 'temp', propertyName)

    await turnStateProperty.set(context, 'someValue')
    const value = await turnStateProperty.get(context)
    assert.equal(value, 'someValue')
  })

  it('should delete the turn state property', async () => {
    const propertyName = 'tempStateProperty'
    const turnStateProperty = new TurnStateProperty(state, 'temp', propertyName)

    await turnStateProperty.set(context, 'someValue')
    await turnStateProperty.delete()
    const value = await turnStateProperty.get(context)
    assert.notEqual(value, 'someValue')
  })
})
