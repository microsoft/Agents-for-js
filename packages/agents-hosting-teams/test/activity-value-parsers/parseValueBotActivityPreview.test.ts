import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { parseValueAgentActivityPreview } from '../../src/parsers/activityValueParsers'
import { ActivityTypes } from '@microsoft/agents-activity'

describe('parseValueBotActivityPreview test', () => {
  it('Parse with all properties', () => {
    const valueObject = {
      botActivityPreview: [
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
    const parsedValue = parseValueAgentActivityPreview(valueObject)
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
      parseValueAgentActivityPreview(valueObject)
    }, ZodError)
  })
})
