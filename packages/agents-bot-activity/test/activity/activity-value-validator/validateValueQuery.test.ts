import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueQuery } from '../../../src/activityValueValidators'

describe('validateValueQuery test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      url: 'url'
    }
    const parsedValue = validateValueQuery(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string url', () => {
    const valueObject = {
      url: 1
    }
    assert.throws(() => {
      validateValueQuery(valueObject)
    }, ZodError)
  })
})
