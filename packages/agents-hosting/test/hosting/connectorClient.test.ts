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

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedTruncatedId}/activities/activityId`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('replyToActivity should allow conversation id max length to be overridden by env', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = '100'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 100)

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedTruncatedId}/activities/activityId`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })

    it('replyToActivity should not truncate if less than max', async () => {
      const conversationId350chars = 'a'.repeat(100) // Make it shorter than 150

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${conversationId350chars}/activities/activityId`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('replyToActivity should not truncate non-agentic', async () => {
      const conversationId350chars = 'a'.repeat(500) // Make it longer than 150

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.User } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${conversationId350chars}/activities/activityId`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('replyToActivity should sanitize path-significant chars in truncated conversation id for agents channel', async () => {
      const conversationId = 'a'.repeat(146) + '/\\#?z'
      const expectedSanitizedConversationId = `${'a'.repeat(146)}____`

      await client.replyToActivity(conversationId, 'activityId', Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedSanitizedConversationId}/activities/activityId`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('replyToActivity should not truncate agentic msteams traffic', async () => {
      const conversationId350chars = 'a'.repeat(350)

      await client.replyToActivity(conversationId350chars, 'activityId', Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

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

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedTruncatedId}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('sendToConversation should allow conversation id max length to be overridden by env', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = '100'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 100)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedTruncatedId}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })

    it('sendToConversation should not truncate if less than max', async () => {
      const conversationId350chars = 'a'.repeat(100) // Less than default max of 150

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${conversationId350chars}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })

    it('sendToConversation should not truncate non-agentic', async () => {
      const conversationId350chars = 'a'.repeat(500) // Make it longer than 150

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.User } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${conversationId350chars}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })
    it('sendToConversation should be resistant to bad value', async () => {
      process.env.MAX_APX_CONVERSATION_ID_LENGTH = 'abcd'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 150
      const expectedTruncatedId = conversationId350chars.substring(0, 150)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      // Verify that post was called once
      sinon.assert.calledOnce(mockAxios)

      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedTruncatedId}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
      delete process.env.MAX_APX_CONVERSATION_ID_LENGTH
    })

    it('sendToConversation should not truncate agentic msteams traffic', async () => {
      const conversationId350chars = 'a'.repeat(350)

      await client.sendToConversation(conversationId350chars, Activity.fromObject({ type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } }))

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

    it('sendToConversation should sanitize path-significant chars in truncated conversation id for agents channel', async () => {
      const conversationId = 'a'.repeat(146) + '/\\#?z'
      const expectedSanitizedConversationId = `${'a'.repeat(146)}____`

      await client.sendToConversation(conversationId, Activity.fromObject({ type: 'message', channelId: 'agents:email', from: { role: RoleTypes.AgenticUser } }))

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.equal(config.method, 'post')
      assert.equal(config.url, `v3/conversations/${expectedSanitizedConversationId}/activities`)
      assert.deepEqual(config.headers, { 'Content-Type': 'application/json' })
    })
  })

  describe('targeted activity query parameter', () => {
    it('sendToConversation adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams, conversation: { id: 'conv-id', isGroup: true } })
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
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat', conversation: { id: 'conv-id', isGroup: true } })
      activity.makeTargetedActivity()

      await client.sendToConversation('conv-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('replyToActivity adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams, conversation: { id: 'conv-id', isGroup: true } })
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
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat', conversation: { id: 'conv-id', isGroup: true } })
      activity.makeTargetedActivity()

      await client.replyToActivity('conv-id', 'act-id', activity)

      sinon.assert.calledOnce(mockAxios)
      const config = mockAxios.getCall(0).args[0]
      assert.strictEqual(config.params, undefined)
    })

    it('updateActivity adds isTargetedActivity param for msteams targeted activity', async () => {
      const activity = Activity.fromObject({ type: 'message', channelId: Channels.Msteams, conversation: { id: 'conv-id', isGroup: true } })
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
      const activity = Activity.fromObject({ type: 'message', channelId: 'webchat', conversation: { id: 'conv-id', isGroup: true } })
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
