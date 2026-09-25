import { describe, it } from 'node:test'
import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('CopilotStudioClientErrors', () => {
  it('should have correct error codes in expected ranges', () => {
    assert.strictEqual(Errors.InvalidPowerPlatformCloud.code, -140000)
    assert.strictEqual(Errors.MissingConnectionUrlSettings.code, -140010)
    assert.strictEqual(Errors.ExecuteStreamingConversationIdRequired.code, -140030)
    assert.strictEqual(Errors.ActivityCannotBeNull.code, -140040)
  })

  it('should contain expected error text in descriptions', () => {
    assert.ok(Errors.InvalidDirectConnectUrl.description.includes('directConnectUrl'))
    assert.ok(Errors.SubscribeUrlConversationIdRequired.description.includes('conversationId'))
    assert.ok(Errors.ActivitySubscriberNotInitialized.description.includes('subscriber'))
  })

  it('should support parameter substitution in error messages', () => {
    const invalidCloud = ExceptionHelper.generateException(Error, Errors.InvalidPowerPlatformCloud, undefined, {
      cloud: 'BadCloud',
      supportedValues: 'Prod, Other'
    })
    assert.ok(invalidCloud.message.includes('BadCloud'))
    assert.ok(invalidCloud.message.includes('Prod, Other'))

    const fetchBlob = ExceptionHelper.generateException(Error, Errors.FailedToFetchBlobUrl, undefined, {
      status: '404',
      statusText: 'Not Found'
    })
    assert.ok(fetchBlob.message.includes('404'))
    assert.ok(fetchBlob.message.includes('Not Found'))
  })

  it('should have all required properties', () => {
    Object.values(Errors).forEach((error) => {
      assert.ok(error.code, 'Error should have a code')
      assert.ok(error.description, 'Error should have a description')
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((error) => error.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
