import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueDataset } from '../../src/parsers/activityValueParsers'

describe('parseValueDataset test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      dataset: 'dataset'
    }
    const parsedValue = parseValueDataset(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string dataset', () => {
    const valueObject = {
      dataset: 1
    }
    assert.throws(() => {
      parseValueDataset(valueObject)
    }, ZodError)
  })
})
