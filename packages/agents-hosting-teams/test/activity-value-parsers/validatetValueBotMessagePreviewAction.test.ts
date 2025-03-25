import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueMessagePreviewAction } from '../../src/parsers/activityValueParsers'

describe('validatetValueBotMessagePreviewAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      messagePreviewAction: 'messagePreviewAction'
    }
    const parsedValue = parseValueMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string messagePreviewAction', () => {
    const valueObject = {
      messagePreviewAction: 1
    }
    assert.throws(() => {
      parseValueMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
