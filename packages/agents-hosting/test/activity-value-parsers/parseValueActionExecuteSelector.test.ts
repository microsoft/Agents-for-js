import assert from 'assert'
import { describe, it } from 'node:test'
import { parseValueActionExecuteSelector } from '../../src/app/adaptiveCards/activityValueParsers'

describe('parseValueActionExecuteSelector test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      action: {
        type: 'type',
        verb: 'verb'
      }
    }
    const parsedValue = parseValueActionExecuteSelector(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with wrong type', () => {
    const valueObject = {
      action: {
        type: 1,
        verb: 'verb'
      }
    }
    assert.throws(() => {
      parseValueActionExecuteSelector(valueObject)
    }, Error)
  })

  it('Should throw with wrong verb', () => {
    const valueObject = {
      action: {
        type: 'type',
        verb: 1
      }
    }
    assert.throws(() => {
      parseValueActionExecuteSelector(valueObject)
    }, Error)
  })
})
