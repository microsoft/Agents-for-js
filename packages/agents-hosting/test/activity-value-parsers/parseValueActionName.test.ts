import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueActionName } from '../../src/app/adaptiveCards/activityValueParsers'

describe('parseValueActionName test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      actionName: 'actionName'
    }
    const parsedValue = parseValueActionName(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string actionName', () => {
    const valueObject = {
      actionName: 1
    }
    assert.throws(() => {
      parseValueActionName(valueObject)
    }, ZodError)
  })
})
