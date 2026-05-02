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

  it('Should return undefined with wrong type', () => {
    const valueObject = {
      action: {
        type: 1,
        verb: 'verb'
      }
    }
    const result = parseValueActionExecuteSelector(valueObject)
    assert.strictEqual(result, undefined)
  })

  it('Should return undefined with wrong verb', () => {
    const valueObject = {
      action: {
        type: 'type',
        verb: 1
      }
    }
    const result = parseValueActionExecuteSelector(valueObject)
    assert.strictEqual(result, undefined)
  })

  it('Should return undefined for null', () => {
    const result = parseValueActionExecuteSelector(null)
    assert.strictEqual(result, undefined)
  })

  it('Should return undefined for undefined', () => {
    const result = parseValueActionExecuteSelector(undefined)
    assert.strictEqual(result, undefined)
  })

  it('Should return undefined for non-AdaptiveCard invoke value', () => {
    const composeExtensionValue = {
      commandId: 'searchQuery',
      parameters: [{ name: 'search', value: 'test' }]
    }
    const result = parseValueActionExecuteSelector(composeExtensionValue)
    assert.strictEqual(result, undefined)
  })

  it('Should return undefined for value with missing action', () => {
    const valueObject = {
      data: { verb: 'test' }
    }
    const result = parseValueActionExecuteSelector(valueObject)
    assert.strictEqual(result, undefined)
  })
})
