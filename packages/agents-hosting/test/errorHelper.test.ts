import { describe, it } from 'node:test'
import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('HostingErrors', () => {
  it('should have correct error codes in expected ranges', () => {
    // TurnContext and Activity Errors
    assert.strictEqual(Errors.MissingTurnContext.code, -120000)
    assert.strictEqual(Errors.TurnContextMissingActivity.code, -120010)
    assert.strictEqual(Errors.ActivityMissingType.code, -120020)

    // Channel and Conversation Errors
    assert.strictEqual(Errors.ChannelIdRequired.code, -120100)
    assert.strictEqual(Errors.ConversationIdRequired.code, -120110)

    // Attachment Errors
    assert.strictEqual(Errors.AttachmentDataRequired.code, -120250)
    assert.strictEqual(Errors.AttachmentIdRequired.code, -120260)
    assert.strictEqual(Errors.ViewIdRequired.code, -120270)
  })

  it('should contain error message in description', () => {
    assert.ok(Errors.MissingTurnContext.description.includes('TurnContext'))
    assert.ok(Errors.ConversationIdRequired.description.includes('conversationId'))
    assert.ok(Errors.AttachmentIdRequired.description.includes('attachmentId'))
    assert.ok(Errors.EmptyActivitiesArray.description.includes('activities'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.ConnectionNotFoundInEnvironment, undefined, { connectionName: 'test-conn' })
    assert.ok(error.message.includes('test-conn'))
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
