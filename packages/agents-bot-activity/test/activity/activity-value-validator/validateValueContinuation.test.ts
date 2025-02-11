import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueContinuation } from '../../../src/activityValueValidators'

describe('validateValueContinuation test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      continuation: 'continuation'
    }
    const parsedValue = validateValueContinuation(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string continuation', () => {
    const valueObject = {
      continuation: 1
    }
    assert.throws(() => {
      validateValueContinuation(valueObject)
    }, ZodError)
  })
})
