import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ActionTypes, CardAction, SuggestedActions } from '../../'
import { suggestedActionsZodSchema } from './../../src/action/suggestedActions'

describe('SuggestedActions', () => {
  it('should create a SuggestedActions with valid properties', () => {
    const arrayTo = ['to']
    const value = { test: 'test' }
    const cardAction: CardAction = {
      type: ActionTypes.Call,
      title: 'title',
      image: 'image',
      text: 'text',
      displayText: 'displayText',
      value,
      channelData: 'channelData',
      imageAltText: 'imageAltText'
    }
    const cardActions = [cardAction]
    const action: SuggestedActions = {
      to: arrayTo,
      actions: cardActions
    }
    assert.strictEqual(action.to, arrayTo)
    assert.strictEqual(action.actions, cardActions)
  })

  it('should throw an error if to is missing', () => {
    // @ts-expect-error
    const action: SuggestedActions = { }
    assert.strictEqual(action.to, undefined)
  })

  it('should throw an error if actions is missing', () => {
    // @ts-expect-error
    const action: SuggestedActions = { }
    assert.strictEqual(action.actions, undefined)
  })
})

describe('SuggestedActions json deserialization', () => {
  it('Deserialize with known to and actions', () => {
    const json = '{ "to": ["to"], "actions": [{ "type": "call", "title": "title", "image": "image", "text": "text", "displayText": "displayText", "value": {"test": "test"}, "channelData": "channelData", "imageAltText": "imageAltText" }] }'
    const arrayTo = ['to']
    const value = { test: 'test' }
    const cardAction: CardAction = {
      type: ActionTypes.Call,
      title: 'title',
      image: 'image',
      text: 'text',
      displayText: 'displayText',
      value,
      channelData: 'channelData',
      imageAltText: 'imageAltText'
    }
    const action: SuggestedActions = suggestedActionsZodSchema.parse(JSON.parse(json))
    assert.deepEqual(action.to, arrayTo)
    assert.deepEqual(action.actions, [cardAction])
  })
})
