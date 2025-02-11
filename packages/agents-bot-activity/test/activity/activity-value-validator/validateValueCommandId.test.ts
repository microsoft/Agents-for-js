import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { validateValueCommandId } from '../../../src/activityValueValidators'

describe('validateValueCommandId test', () => {
  it('Validate with all properties', () => {
    const valueObject = {
      commandId: 'botMessagePreviewAction'
    }
    const parsedValue = validateValueCommandId(valueObject)
    assert.deepEqual(parsedValue, valueObject)
  })

  it('Should throw with not string commandId', () => {
    const valueObject = {
      commandId: 1
    }
    assert.throws(() => {
      validateValueCommandId(valueObject)
    }, ZodError)
  })
})
