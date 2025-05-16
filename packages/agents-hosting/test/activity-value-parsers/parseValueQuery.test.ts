import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueQuery } from '../../src/app/adaptiveCards/activityValueParsers'

describe('parseValueQuery test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      url: 'url'
    }
    const parsedValue = parseValueQuery(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string url', () => {
    const valueObject = {
      url: 1
    }
    assert.throws(() => {
      parseValueQuery(valueObject)
    }, ZodError)
  })
})
