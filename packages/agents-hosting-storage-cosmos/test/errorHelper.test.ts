import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentErrorDefinition } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('Errors tests', () => {
  it('should have MissingCosmosDbStorageOptions error definition', () => {
    const error = Errors.MissingCosmosDbStorageOptions

    assert.strictEqual(error.code, -100000)
    assert.strictEqual(error.description, 'CosmosDbPartitionedStorageOptions is required.')
    assert.strictEqual(error.helplink, undefined)
  })

  it('should have MissingCosmosEndpoint error definition', () => {
    const error = Errors.MissingCosmosEndpoint

    assert.strictEqual(error.code, -100001)
    assert.strictEqual(error.description, 'endpoint in cosmosClientOptions is required.')
    assert.strictEqual(error.helplink, undefined)
  })

  it('should have MissingCosmosCredentials error definition', () => {
    const error = Errors.MissingCosmosCredentials

    assert.strictEqual(error.code, -100002)
    assert.strictEqual(error.description, 'key or tokenProvider in cosmosClientOptions is required.')
    assert.strictEqual(error.helplink, undefined)
  })

  it('should have all error codes in the correct range', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val
    ) as AgentErrorDefinition[]

    // All error codes should be negative and in the range -100000 to -100021
    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.code < 0, `Error code ${errorDef.code} should be negative`)
      assert.ok(errorDef.code >= -100021, `Error code ${errorDef.code} should be >= -100021`)
      assert.ok(errorDef.code <= -100000, `Error code ${errorDef.code} should be <= -100000`)
    })
  })

  it('should have unique error codes', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val
    ) as AgentErrorDefinition[]

    const codes = errorDefinitions.map(e => e.code)
    const uniqueCodes = new Set(codes)

    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })

  it('should not have helplink defined (using default)', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val
    ) as AgentErrorDefinition[]

    // All errors should not have a helplink property (they will use the default from ExceptionHelper)
    errorDefinitions.forEach(errorDef => {
      assert.strictEqual(errorDef.helplink, undefined, 'Helplink should be undefined to use default')
    })
  })

  it('should have non-empty descriptions', () => {
    const errorDefinitions = Object.values(Errors).filter(
      val => val && typeof val === 'object' && 'code' in val && 'description' in val
    ) as AgentErrorDefinition[]

    errorDefinitions.forEach(errorDef => {
      assert.ok(errorDef.description.length > 0, 'Description should not be empty')
    })
  })
})
