import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueActionFeedbackLoopData } from '../../../src/activityValueValidators'

describe('validateValueActionFeedbackLoopData test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      actionValue: {
        reaction: 'like',
        feedback: 'feedback'
      }
    }
    const parsedValue = validateValueActionFeedbackLoopData(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with wrong reaction type', () => {
    const valueObject = {
      actionValue: {
        reaction: 1,
        feedback: 'feedback'
      }
    }
    assert.throws(() => {
      validateValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong reaction string', () => {
    const valueObject = {
      actionValue: {
        reaction: 'feedback',
        feedback: 'feedback'
      }
    }
    assert.throws(() => {
      validateValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong feedback', () => {
    const valueObject = {
      actionValue: {
        reaction: 'like',
        feedback: 1
      }
    }
    assert.throws(() => {
      validateValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with no reaction', () => {
    const valueObject = {
      actionValue: {
        feedback: 'feedback'
      }
    }
    assert.throws(() => {
      validateValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with no feedback', () => {
    const valueObject = {
      actionValue: {
        reaction: 'like'
      }
    }
    assert.throws(() => {
      validateValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })
})
