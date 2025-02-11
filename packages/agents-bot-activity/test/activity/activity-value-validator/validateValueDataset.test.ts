import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueDataset } from '../../../src/activityValueValidators'

describe('validateValueDataset test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      dataset: 'dataset'
    }
    const parsedValue = validateValueDataset(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string dataset', () => {
    const valueObject = {
      dataset: 1
    }
    assert.throws(() => {
      validateValueDataset(valueObject)
    }, ZodError)
  })
})
