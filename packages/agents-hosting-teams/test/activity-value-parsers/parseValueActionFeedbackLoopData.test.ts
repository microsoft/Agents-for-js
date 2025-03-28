import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueActionFeedbackLoopData } from '../../src/parsers/activityValueParsers'

describe('parseValueActionFeedbackLoopData test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      actionValue: {
        reaction: 'like',
        feedback: 'feedback'
      }
    }
    const parsedValue = parseValueActionFeedbackLoopData(valueObject)
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
      parseValueActionFeedbackLoopData(valueObject)
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
      parseValueActionFeedbackLoopData(valueObject)
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
      parseValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with no reaction', () => {
    const valueObject = {
      actionValue: {
        feedback: 'feedback'
      }
    }
    assert.throws(() => {
      parseValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })

  it('Should throw with no feedback', () => {
    const valueObject = {
      actionValue: {
        reaction: 'like'
      }
    }
    assert.throws(() => {
      parseValueActionFeedbackLoopData(valueObject)
    }, ZodError)
  })
})
