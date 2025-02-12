import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueActionName } from '../../../src/activityValueValidators'

describe('validateValueActionName test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      actionName: 'actionName'
    }
    const parsedValue = validateValueActionName(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string actionName', () => {
    const valueObject = {
      actionName: 1
    }
    assert.throws(() => {
      validateValueActionName(valueObject)
    }, ZodError)
  })
})
