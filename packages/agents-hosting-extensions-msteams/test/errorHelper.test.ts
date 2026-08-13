import { describe, it } from 'node:test'
import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('TeamsExtensionErrors', () => {
  it('should have correct error codes', () => {
    assert.strictEqual(Errors.UnexpectedTaskModuleSubmit.code, -150016)
    assert.strictEqual(Errors.TeamsApiClientNotAvailable.code, -150010)
    assert.strictEqual(Errors.TeamsApiClientSetupFailed.code, -150011)
    assert.strictEqual(Errors.TeamsGraphTokenUnavailable.code, -150012)
    assert.strictEqual(Errors.TeamsGraphAuthorizationHandlerRequired.code, -150013)
    assert.strictEqual(Errors.TeamsGraphAuthorizationHandlerNameRequired.code, -150014)
    assert.strictEqual(Errors.TeamsGraphParameterRequired.code, -150015)
    assert.strictEqual(Errors.TeamsGraphInvalidBaseUrl.code, -150017)
    assert.strictEqual(Errors.TeamsGraphUserAuthorizationNotConfigured.code, -150018)
    assert.strictEqual(Errors.TeamsGraphConnectionsNotConfigured.code, -150019)
  })

  it('should contain error message in description', () => {
    assert.ok(Errors.UnexpectedTaskModuleSubmit.description.includes('TaskModules'))
    assert.ok(Errors.TeamsApiClientNotAvailable.description.includes('Teams API client'))
    assert.ok(Errors.TeamsGraphTokenUnavailable.description.includes('Graph access token'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.UnexpectedTaskModuleSubmit, undefined, { activityType: 'testType' })
    assert.ok(error.message.includes('testType'))

    const graphError = ExceptionHelper.generateException(Error, Errors.TeamsGraphTokenUnavailable, undefined, { handlerName: 'graph' })
    assert.ok(graphError.message.includes('graph'))

    const parameterError = ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'context' })
    assert.ok(parameterError.message.includes('context'))
  })

  it('should have all required properties', () => {
    Object.values(Errors).forEach((error) => {
      assert.ok(error.code, 'Error should have a code')
      assert.ok(error.description, 'Error should have a description')
      // helplink is optional and will use the default from ExceptionHelper when not provided
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((error) => error.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
