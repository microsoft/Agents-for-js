import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ActionTypes, Activity, ActivityTypes, CardAction } from '..'
import { cardActionZodSchema } from './cardAction'

describe('CardAction', () => {
  it('should create a CardAction with valid properties', () => {
    const value = { test: 'test' }
    const action: CardAction = {
      type: ActionTypes.Call,
      title: 'title',
      image: 'image',
      text: 'text',
      displayText: 'displayText',
      value,
      channelData: 'channelData',
      imageAltText: 'imageAltText'
    }
    assert.strictEqual(action.type, ActionTypes.Call)
    assert.strictEqual(action.type, 'call')
    assert.equal(action.title, 'title')
    assert.equal(action.image, 'image')
    assert.equal(action.text, 'text')
    assert.equal(action.displayText, 'displayText')
    assert.equal(action.value, value)
    assert.equal(action.channelData, 'channelData')
    assert.equal(action.imageAltText, 'imageAltText')
  })

  it('should throw an error if type is missing', () => {
    // @ts-expect-error
    const action: CardAction = { }
    assert.strictEqual(action.type, undefined)
  })

  it('should throw an error if title is missing', () => {
    // @ts-expect-error
    const action: CardAction = { }
    assert.strictEqual(action.title, undefined)
  })

  it('should throw an error if value is missing', () => {
    // @ts-expect-error
    const action: CardAction = { }
    assert.strictEqual(action.value, undefined)
  })
})

describe('CardAction json deserialization', () => {
  it('Deserialize with known type, title, image, text, displayText, value, channelData, imageAltText', () => {
    const value = { test: 'test' }
    const json = '{ "type": "call", "title": "title", "image": "image", "text": "text", "displayText": "displayText", "value": {"test": "test"}, "channelData": "channelData", "imageAltText": "imageAltText" }'
    const action: CardAction = cardActionZodSchema.parse(JSON.parse(json))
    assert.strictEqual(action.type, ActionTypes.Call)
    assert.strictEqual(action.type, 'call')
    assert.equal(action.title, 'title')
    assert.equal(action.image, 'image')
    assert.equal(action.text, 'text')
    assert.equal(action.displayText, 'displayText')
    assert.deepEqual(action.value, value)
    assert.equal(action.channelData, 'channelData')
    assert.equal(action.imageAltText, 'imageAltText')
  })

  it('Deserialize with known title, image, text, displayText, value, channelData, imageAltText and bad type', () => {
    const json = '{ "type" : "new_type", "title": "title", "image": "image", "text": "text", "displayText": "displayText", "value": {"test": "test"}, "channelData": "channelData", "imageAltText": "imageAltText" }'
    const action: CardAction = cardActionZodSchema.parse(JSON.parse(json))
    const value = { test: 'test' }
    assert.notEqual(action.type, ActionTypes.Call)
    assert.strictEqual(action.type, 'new_type')
    assert.equal(action.title, 'title')
    assert.equal(action.image, 'image')
    assert.equal(action.text, 'text')
    assert.equal(action.displayText, 'displayText')
    assert.deepEqual(action.value, value)
    assert.equal(action.channelData, 'channelData')
    assert.equal(action.imageAltText, 'imageAltText')
  })

  it('Deserialize suggested action with Card action as string', () => {
    const cardActions = [
      {
        type: ActionTypes.ImBack,
        title: 'Red',
        value: 'Red'
      },
      {
        type: ActionTypes.ImBack,
        title: 'Yellow',
        value: 'Yellow'
      },
      {
        type: ActionTypes.ImBack,
        title: 'Blue',
        value: 'Blue'
      }
    ]

    const reply = new Activity(ActivityTypes.Message)
    reply.text = 'Pick a color'
    reply.suggestedActions = { actions: cardActions, to: ['turnContext.activity.from.id'] }
    const act = Activity.fromObject(reply)
    assert.deepEqual(act.suggestedActions?.actions, cardActions)
  })
})
