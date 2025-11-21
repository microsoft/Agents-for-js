import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentErrorDefinition } from '../src/exceptionHelper'
import { Errors } from '../src/errorHelper'

describe('Activity Errors tests', () => {
  it('should have InvalidActivityTypeUndefined error definition', () => {
    const error = Errors.InvalidActivityTypeUndefined

    assert.strictEqual(error.code, -110000)
    assert.strictEqual(error.description, 'Invalid ActivityType: undefined')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have InvalidActivityTypeNull error definition', () => {
    const error = Errors.InvalidActivityTypeNull

    assert.strictEqual(error.code, -110001)
    assert.strictEqual(error.description, 'Invalid ActivityType: null')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have InvalidActivityTypeEmptyString error definition', () => {
    const error = Errors.InvalidActivityTypeEmptyString

    assert.strictEqual(error.code, -110002)
    assert.strictEqual(error.description, 'Invalid ActivityType: empty string')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have all error codes in the correct range', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val && 'helplink' in val
    ) as AgentErrorDefinition[]

    // All error codes should be negative and in the range -110000 to -110999
    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.code < 0, `Error code ${errorDef.code} should be negative`)
      assert.ok(errorDef.code >= -110999, `Error code ${errorDef.code} should be >= -110999`)
      assert.ok(errorDef.code <= -110000, `Error code ${errorDef.code} should be <= -110000`)
    })
  })

  it('should have unique error codes', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val && 'helplink' in val
    ) as AgentErrorDefinition[]

    const codes = errorDefinitions.map(e => e.code)
    const uniqueCodes = new Set(codes)

    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })

  it('should have help links with tokenized format', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val && 'helplink' in val
    ) as AgentErrorDefinition[]

    errorDefinitions.forEach(errorDef => {
      assert.ok(
        errorDef.helplink.includes('{errorCode}'),
        `Help link should contain {errorCode} token: ${errorDef.helplink}`
      )
      assert.ok(
        errorDef.helplink.startsWith('https://aka.ms/M365AgentsErrorCodes/#'),
        `Help link should start with correct URL: ${errorDef.helplink}`
      )
    })
  })

  it('should have non-empty descriptions', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val && 'helplink' in val
    ) as AgentErrorDefinition[]

    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.description.length > 0, 'Description should not be empty')
    })
  })
})
