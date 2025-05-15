import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueAction } from '../../src/app/adaptiveCards/activityValueParsers'

describe('parseValueAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      action: 'action'
    }
    const parsedValue = parseValueAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string action', () => {
    const valueObject = {
      action: 1
    }
    assert.throws(() => {
      parseValueAction(valueObject)
    }, ZodError)
  })
})
