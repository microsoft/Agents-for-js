import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueAction } from '../../../src/activityValueValidators'

describe('validateValueAction test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      action: 'action'
    }
    const parsedValue = validateValueAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string action', () => {
    const valueObject = {
      action: 1
    }
    assert.throws(() => {
      validateValueAction(valueObject)
    }, ZodError)
  })
})
