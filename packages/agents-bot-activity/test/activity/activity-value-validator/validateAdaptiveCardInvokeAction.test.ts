import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateAdaptiveCardInvokeAction } from '../../../src/activityValueValidators'

describe('AdaptiveCardInvokeAction Zod Validation', () => {
  it('Validate with all properties', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 'id',
      verb: 'verb',
      data: { x: 'data' }
    }
    const adaptiveCardInvokeAction = validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    assert.deepEqual(adaptiveCardInvokeActionObject, adaptiveCardInvokeAction)
  })

  it('Should throw with no type', () => {
    const adaptiveCardInvokeActionObject = {
      id: 'id',
      verb: 'verb',
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with not string type', () => {
    const adaptiveCardInvokeActionObject = {
      type: 1,
      id: 'id',
      verb: 'verb',
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no id', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      verb: 'verb',
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no string id', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 1,
      verb: 'verb',
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no verb', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 'id',
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no string verb', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 'id',
      verb: 1,
      data: { x: 'data' }
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no data', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 'id',
      verb: 'verb',
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })

  it('Should throw with no record data', () => {
    const adaptiveCardInvokeActionObject = {
      type: 'type',
      id: 'id',
      verb: 'verb',
      data: 'data'
    }
    assert.throws(() => {
      validateAdaptiveCardInvokeAction(adaptiveCardInvokeActionObject)
    }, ZodError)
  })
})
