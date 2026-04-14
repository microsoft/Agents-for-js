import { describe, it, beforeEach, afterEach } from 'node:test'
import { strict as assert } from 'assert'
import { ConnectorClient } from '../../src'
import { Activity, RoleTypes, Channels } from '@microsoft/agents-activity'
import sinon from 'sinon'

describe('ConnectorClient', () => {
  let mockAxios: any
  let client: ConnectorClient
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    // Create a mock axios instance with the methods we need
    mockAxios = sandbox.stub().resolves({ data: { id: 'reply-id' } })

    // Create ConnectorClient using the factory method with mock token
    client = ConnectorClient.createClientWithToken('https://test.com', 'mock-token')

    // Replace the internal axios instance with our mock
    ; (client as any)._axiosInstance = mockAxios
  })

  afterEach(function () {
    if (sandbox) {
      sandbox.restore()
    }
  })

  describe('truncation of conversation id', () => {
    it('replyToActivity should truncate conversation id that is > 150 by default and use this in the url', async () => {
      const conversationId350chars = 'a'.repeat(350) // Make it longer than 150`
      const expectedTruncatedId = conversationId350chars.substring(0, 150)

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${expectedTruncatedId}/activities/activityId`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
    })

    it('replyToActivity should allow conversation id max length to be overridden by env', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = '100'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 100)

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${expectedTruncatedId}/activities/activityId`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })

    it('replyToActivity should not truncate if less than max', async () => {
      const conversationId350chars = 'a'.repeat(100) // Make it shorter than 150

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${conversationId350chars}/activities/activityId`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
    })

    it('replyToActivity should not truncate non-agentic', async () => {
      const conversationId350chars = 'a'.repeat(500) // Make it longer than 150

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.User } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${conversationId350chars}/activities/activityId`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.User } }
      })
    })

    /** ************************************************ */
    /** ************************************************ */
    /** ************************************************ */
    /** * Tests for sendToConversation                    */
    /** ************************************************ */
    /** ************************************************ */
    /** ************************************************ */

    it('sendToConversation should truncate conversation id that is > 150 by default and use this in the url', async () => {
      const conversationId350chars = 'a'.repeat(350) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 150)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${expectedTruncatedId}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
    })

    it('sendToConversation should allow conversation id max length to be overridden by env', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = '100'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 100)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${expectedTruncatedId}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })

    it('sendToConversation should not truncate if less than max', async () => {
      const conversationId350chars = 'a'.repeat(100) // Less than default max of 150

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${conversationId350chars}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
    })

    it('sendToConversation should not truncate non-agentic', async () => {
      const conversationId350chars = 'a'.repeat(500) // Make it longer than 150

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.User } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${conversationId350chars}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.User } }
      })
    })
    it('sendToConversation should be resistant to bad value', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = 'abcd'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 150)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      sinon.assert.calledWith(mockAxios, {
        method: 'post',
        url: `v3/conversations/${expectedTruncatedId}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }
      })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })
  })

  describe('targeted activity query parameter', () => {
    it('sendToConversation adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })
      activity.makeTargetedActivity()

      await client.sendToConversation('conv-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.deepStrictEqual(config.params, { isTargetedActivity: 'true' })
    })

    it('sendToConversation does NOT add param for msteams non-targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })

      await client.sendToConversation('conv-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('sendToConversation does NOT add param for non-msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat' })
      activity.makeTargetedActivity()

      await client.sendToConversation('conv-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('replyToActivity adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })
      activity.makeTargetedActivity()

      await client.replyToActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.deepStrictEqual(config.params, { isTargetedActivity: 'true' })
    })

    it('replyToActivity does NOT add param for msteams non-targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })

      await client.replyToActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('replyToActivity does NOT add param for non-msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat' })
      activity.makeTargetedActivity()

      await client.replyToActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('updateActivity adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })
      activity.makeTargetedActivity()

      await client.updateActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.deepStrictEqual(config.params, { isTargetedActivity: 'true' })
    })

    it('updateActivity does NOT add param for msteams non-targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams })

      await client.updateActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('updateActivity does NOT add param for non-msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat' })
      activity.makeTargetedActivity()

      await client.updateActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('deleteActivity adds isTargetedActivity param when isTargetedActivity=true', async () => {
      await client.deleteActivity('conv-id', 'act-id', true)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.deepStrictEqual(config.params, { isTargetedActivity: 'true' })
    })

    it('deleteActivity does NOT add param when isTargetedActivity=false', async () => {
      await client.deleteActivity('conv-id', 'act-id', false)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('deleteActivity does NOT add param when isTargetedActivity is omitted', async () => {
      await client.deleteActivity('conv-id', 'act-id')

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })
  })
})
