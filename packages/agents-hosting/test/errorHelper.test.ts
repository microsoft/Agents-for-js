import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentErrorDefinition } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('Hosting Errors tests', () => {
  it('should have MissingTurnContext error definition', () => {
    const error = Errors.MissingTurnContext

    assert.strictEqual(error.code, -120000)
    assert.strictEqual(error.description, 'Missing TurnContext parameter')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have KeysRequiredForReading error definition', () => {
    const error = Errors.KeysRequiredForReading

    assert.strictEqual(error.code, -120040)
    assert.strictEqual(error.description, 'Keys are required when reading.')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have ChangesRequiredForWriting error definition', () => {
    const error = Errors.ChangesRequiredForWriting

    assert.strictEqual(error.code, -120041)
    assert.strictEqual(error.description, 'Changes are required when writing.')
    assert.strictEqual(error.helplink, 'https://aka.ms/M365AgentsErrorCodes/#{errorCode}')
  })

  it('should have all error codes in the correct range', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val && 'helplink' in val
    ) as AgentErrorDefinition[]

    // All error codes should be negative and in the range -120000 to -120299
    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.code < 0, `Error code ${errorDef.code} should be negative`)
      assert.ok(errorDef.code >= -120299, `Error code ${errorDef.code} should be >= -120299`)
      assert.ok(errorDef.code <= -120000, `Error code ${errorDef.code} should be <= -120000`)
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
