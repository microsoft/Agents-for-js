import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueActionExecuteSelector } from '../../../src/activityValueValidators'

describe('validateValueActionExecuteSelector test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      action: {
        type: 'type',
        verb: 'verb'
      }
    }
    const parsedValue = validateValueActionExecuteSelector(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with wrong type', () => {
    const valueObject = {
      action: {
        type: 1,
        verb: 'verb'
      }
    }
    assert.throws(() => {
      validateValueActionExecuteSelector(valueObject)
    }, ZodError)
  })

  it('Should throw with wrong verb', () => {
    const valueObject = {
      action: {
        type: 'type',
        verb: 1
      }
    }
    assert.throws(() => {
      validateValueActionExecuteSelector(valueObject)
    }, ZodError)
  })
})
