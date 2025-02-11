import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueBotActivityPreview } from '../../../src/activityValueValidators'
import { ActivityTypes } from '../../../src/activityTypes'

describe('validateValueBotActivityPreview test', () => {
  it('Validate with all properties', () => {
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
    const parsedValue = validateValueBotActivityPreview(valueObject)
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
      validateValueBotActivityPreview(valueObject)
    }, ZodError)
  })
})
