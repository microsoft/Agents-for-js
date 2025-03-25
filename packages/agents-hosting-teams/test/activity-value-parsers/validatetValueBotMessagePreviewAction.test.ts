import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueMessagePreviewAction } from '../../src/parsers/activityValueParsers'

describe('validatetValueBotMessagePreviewAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      botMessagePreviewAction: 'botMessagePreviewAction'
    }
    const parsedValue = parseValueMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string botMessagePreviewAction', () => {
    const valueObject = {
      botMessagePreviewAction: 1
    }
    assert.throws(() => {
      parseValueMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
