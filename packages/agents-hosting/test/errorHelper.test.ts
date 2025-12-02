import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('HostingErrors', () => {
  it('should have correct error codes in expected ranges', () => {
    // TurnContext and Activity Errors
    assert.strictEqual(Errors.MissingTurnContext.code, -120000)
    assert.strictEqual(Errors.TurnContextMissingActivity.code, -120001)
    assert.strictEqual(Errors.ActivityMissingType.code, -120002)
    
    // Channel and Conversation Errors
    assert.strictEqual(Errors.ChannelIdRequired.code, -120010)
    assert.strictEqual(Errors.ConversationIdRequired.code, -120011)
    
    // Attachment Errors  
    assert.strictEqual(Errors.AttachmentDataRequired.code, -120025)
    assert.strictEqual(Errors.AttachmentIdRequired.code, -120026)
    assert.strictEqual(Errors.ViewIdRequired.code, -120027)
  })

  it('should contain error message in description', () => {
    assert.ok(Errors.MissingTurnContext.description.includes('TurnContext'))
    assert.ok(Errors.ConversationIdRequired.description.includes('conversationId'))
    assert.ok(Errors.AttachmentIdRequired.description.includes('attachmentId'))
    assert.ok(Errors.EmptyActivitiesArray.description.includes('activities'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.ConnectionNotFound, { connectionName: 'test-conn' })
    assert.ok(error.message.includes('test-conn'))
  })

  it('should have all required properties', () => {
    Object.values(Errors).forEach((error) => {
      assert.ok(error.code, 'Error should have a code')
      assert.ok(error.description, 'Error should have a description')
      assert.ok(error.helplink, 'Error should have a helplink')
    })
  })

  it('should have unique error codes', () => {
    const codes = Object.values(Errors).map((error) => error.code)
    const uniqueCodes = new Set(codes)
    assert.strictEqual(codes.length, uniqueCodes.size, 'All error codes should be unique')
  })
})
