import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueBotMessagePreviewAction } from '../../src/parsers/activityValueParsers'

describe('validatetValueBotMessagePreviewAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      botMessagePreviewAction: 'botMessagePreviewAction'
    }
    const parsedValue = parseValueBotMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string botMessagePreviewAction', () => {
    const valueObject = {
      botMessagePreviewAction: 1
    }
    assert.throws(() => {
      parseValueBotMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
