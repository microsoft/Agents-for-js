import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueAgentMessagePreviewAction } from '../../src/parsers/activityValueParsers'

describe('parseValueBotMessagePreviewAction test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      botMessagePreviewAction: 'botMessagePreviewAction'
    }
    const parsedValue = parseValueAgentMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string botMessagePreviewAction', () => {
    const valueObject = {
      botMessagePreviewAction: 1
    }
    assert.throws(() => {
      parseValueAgentMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
