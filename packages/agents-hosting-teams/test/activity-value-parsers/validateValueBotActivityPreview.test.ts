import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueBotActivityPreview } from '../../src/parsers/activityValueParsers'
import { ActivityTypes } from '@microsoft/agents-hosting'

describe('parseValueBotActivityPreview test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      activityPreview: [
        {
          type: ActivityTypes.Invoke,
          text: 'test 1'
        },
        {
          type: ActivityTypes.Invoke,
          text: 'test 2'
        }
      ]
    }
    const parsedValue = parseValueBotActivityPreview(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with wrong activity', () => {
    const valueObject = {
      botActivityPreview: [
        {
          type: ActivityTypes.Invoke,
          text: 'test 1'
        },
        {
          type: ActivityTypes.Invoke,
          text: 2
        }
      ]
    }
    assert.throws(() => {
      parseValueBotActivityPreview(valueObject)
    }, ZodError)
  })
})
