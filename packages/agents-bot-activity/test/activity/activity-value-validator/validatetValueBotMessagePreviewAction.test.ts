import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validatetValueBotMessagePreviewAction } from '../../../src/activityValueValidators'

describe('validatetValueBotMessagePreviewAction test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      botMessagePreviewAction: 'botMessagePreviewAction'
    }
    const parsedValue = validatetValueBotMessagePreviewAction(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string botMessagePreviewAction', () => {
    const valueObject = {
      botMessagePreviewAction: 1
    }
    assert.throws(() => {
      validatetValueBotMessagePreviewAction(valueObject)
    }, ZodError)
  })
})
