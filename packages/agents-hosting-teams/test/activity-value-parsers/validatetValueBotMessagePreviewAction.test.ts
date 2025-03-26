import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueBotMessagePreviewAction } from '../../src/parsers/activityValueParsers'

describe('parseValueBotMessagePreviewAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      messagePreviewAction: 'messagePreviewAction'
    }
    const parsedValue = parseValueBotMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string messagePreviewAction', () => {
    const valueObject = {
      messagePreviewAction: 1
    }
    assert.throws(() => {
      parseValueBotMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
