import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { MessageFactory } from '@microsoft/agents-hosting'
import { ChoiceFactory, Choice } from '../src/choices'
import { ActionTypes, Activity } from '@microsoft/agents-activity'

/**
 *
 * @param received
 * @param expected
 */
function assertActivity (received: Activity, expected: Activity): void {
  assert(received)
  for (const key in expected) {
    const value = received[key as keyof Activity]
    assert(value !== undefined, `Activity.${key} missing.`)
    const expectedValue = expected[key as keyof Activity]
    assert.strictEqual(typeof value, typeof expectedValue)
    if (Array.isArray(expectedValue) && Array.isArray(value)) {
      assert.strictEqual(value.length, expectedValue.length)
      assert.strictEqual(JSON.stringify(value), JSON.stringify(expectedValue))
    } else if (typeof expectedValue === 'object') {
      assert.strictEqual(JSON.stringify(value), JSON.stringify(expectedValue))
    } else {
      assert.strictEqual(value, expectedValue)
    }
  }
}

const colorChoices: string[] = ['red', 'green', 'blue']

const choicesWithActionTitle = [
  {
    value: 'red',
    action: { type: ActionTypes.ImBack, title: 'Red Color' }
  },
  {
    value: 'green',
    action: { type: ActionTypes.ImBack, title: 'Green Color' }
  },
  {
    value: 'blue',
    action: { type: ActionTypes.ImBack, title: 'Blue Color' }
  },
]

const choicesWithActionValue = [
  {
    value: 'red',
    action: {
      type: ActionTypes.ImBack,
      value: 'Red Color',
    },
  },
  {
    value: 'green',
    action: {
      type: ActionTypes.ImBack,
      value: 'Green Color',
    },
  },
  {
    value: 'blue',
    action: {
      type: ActionTypes.ImBack,
      value: 'Blue Color',
    },
  },
]

const choicesWithEmptyActions = [
  {
    value: 'red',
    action: {},
  },
  {
    value: 'green',
    action: {},
  },
  {
    value: 'blue',
    action: {},
  },
]

const choicesWithPostBacks: Choice[] = [
  {
    value: 'red',
    action: { type: ActionTypes.PostBack, title: 'red' }
  },
  {
    value: 'green',
    action: { type: ActionTypes.PostBack, title: 'green' }
  },
  {
    value: 'blue',
    action: { type: ActionTypes.PostBack, title: 'blue' }
  },
]

/**
 *
 * @param choices
 * @param actionValues
 * @param actionType
 */
function assertChoices (
  choices: Choice[],
  actionValues: string[],
  actionType: string = ActionTypes.ImBack
): void {
  assert.strictEqual(choices.length, actionValues.length)
  for (let i = 0; i < choices.length; i++) {
    const choice = choices[i]
    const val = actionValues[i]
    assert.strictEqual(choice.action?.type, actionType)
    assert.strictEqual(choice.action?.value, val)
    assert.strictEqual(choice.action?.title, val)
  }
}

describe('choice factory', function () {
  it('should render choices inline.', function () {
    const activity = ChoiceFactory.inline(colorChoices, 'select from:')
    const expectedActivity = MessageFactory.text('select from: (1) red, (2) green, or (3) blue', '', 'expectingInput')
    assertActivity(activity, expectedActivity)
  })

  it('should render choices as a list.', function () {
    const activity = ChoiceFactory.list(colorChoices, 'select from:')
    const expectedActivity = MessageFactory.text('select from:\n\n   1. red\n   2. green\n   3. blue', '', 'expectingInput')
    assertActivity(activity, expectedActivity)
  })

  it('should render an inline list based on title length, choice length, and channel', function () {
    const activity = ChoiceFactory.forChannel('skypeforbusiness', colorChoices, 'select from:')
    const expectedActivity = MessageFactory.text('select from: (1) red, (2) green, or (3) blue', '', 'expectingInput')
    assertActivity(activity, expectedActivity)
  })

  it('should use action.title to populate action.value if action.value is falsey.', function () {
    const preparedChoices = ChoiceFactory.toChoices(choicesWithActionTitle)
    assertChoices(preparedChoices, ['Red Color', 'Green Color', 'Blue Color'])
  })

  it('should use action.value to populate action.title if action.title is falsey.', function () {
    const preparedChoices = ChoiceFactory.toChoices(choicesWithActionValue as Choice[])
    assertChoices(preparedChoices, ['Red Color', 'Green Color', 'Blue Color'])
  })

  it('should use choice.value to populate action.title and action.value if both are missing.', function () {
    const preparedChoices = ChoiceFactory.toChoices(choicesWithEmptyActions as Choice[])
    assertChoices(preparedChoices, ['red', 'green', 'blue'])
  })

  it('should use provided ActionType.', function () {
    const preparedChoices = ChoiceFactory.toChoices(choicesWithPostBacks)
    assertChoices(preparedChoices, ['red', 'green', 'blue'], ActionTypes.PostBack)
  })

  it('should return a stylized list.', function () {
    const listActivity = ChoiceFactory.forChannel('emulator', ['choiceTitleOverTwentyChars'], 'Test')
    assert.strictEqual(listActivity.text, 'Test\n\n   1. choiceTitleOverTwentyChars')
  })
})
