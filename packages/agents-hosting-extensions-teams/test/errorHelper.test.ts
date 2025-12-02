import assert from 'assert'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../src/errorHelper'

describe('TeamsExtensionErrors', () => {
  it('should have correct error codes', () => {
    assert.strictEqual(Errors.ContextRequired.code, -150000)
    assert.strictEqual(Errors.MeetingIdRequired.code, -150001)
    assert.strictEqual(Errors.ParticipantIdRequired.code, -150002)
    assert.strictEqual(Errors.TeamIdRequired.code, -150003)
    assert.strictEqual(Errors.TurnContextCannotBeNull.code, -150004)
    assert.strictEqual(Errors.ActivityCannotBeNull.code, -150005)
    assert.strictEqual(Errors.TeamsChannelIdRequired.code, -150006)
    assert.strictEqual(Errors.ActivityRequired.code, -150007)
    assert.strictEqual(Errors.TenantIdRequired.code, -150008)
    assert.strictEqual(Errors.MembersListRequired.code, -150009)
    assert.strictEqual(Errors.OperationIdRequired.code, -150010)
    assert.strictEqual(Errors.MissingActivityParameter.code, -150011)
    assert.strictEqual(Errors.OnlyValidInTeamsScope.code, -150012)
    assert.strictEqual(Errors.UserIdRequired.code, -150013)
    assert.strictEqual(Errors.ConversationIdRequired.code, -150014)
    assert.strictEqual(Errors.ClientNotAvailable.code, -150015)
    assert.strictEqual(Errors.UnexpectedTaskModuleSubmit.code, -150016)
    assert.strictEqual(Errors.NotImplemented.code, -150017)
    assert.strictEqual(Errors.BadRequest.code, -150018)
  })

  it('should contain error message in description', () => {
    assert.ok(Errors.ContextRequired.description.includes('context'))
    assert.ok(Errors.MeetingIdRequired.description.includes('meetingId'))
    assert.ok(Errors.TeamIdRequired.description.includes('teamId'))
    assert.ok(Errors.ActivityRequired.description.includes('activity'))
    assert.ok(Errors.NotImplemented.description.includes('NotImplemented'))
  })

  it('should support parameter substitution in error messages', () => {
    const error = ExceptionHelper.generateException(Error, Errors.UnexpectedTaskModuleSubmit, { activityType: 'testType' })
    assert.ok(error.message.includes('testType'))
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
