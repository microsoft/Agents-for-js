import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueContinuation } from '../../src/parsers/activityValueParsers'

describe('parseValueContinuation test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      continuation: 'continuation'
    }
    const parsedValue = parseValueContinuation(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string continuation', () => {
    const valueObject = {
      continuation: 1
    }
    assert.throws(() => {
      parseValueContinuation(valueObject)
    }, ZodError)
  })
})
