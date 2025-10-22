import { describe, it, beforeEach, afterEach } from 'node:test'
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
    it('should truncate conversation id that is > 325 by default and use this in the url', async () => {
      const conversationId350chars = 'a'.repeat(350) // Make it longer than 325
      const expectedTruncatedId = conversationId350chars.substring(0, 325)

      await client.replyToActivity(conversationId350chars, 'activityId', { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } } as Activity)

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

    it('should allow conversation id max length to be overridden by env', async () => {
      process.env.MAX_CONVERSATION_ID_LENGTH = '100'
      const conversationId350chars = 'a'.repeat(450) // Make it longer than 325
      const expectedTruncatedId = conversationId350chars.substring(0, 100)

      await client.replyToActivity(conversationId350chars, 'activityId', { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } } as Activity)

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
      delete process.env.MAX_CONVERSATION_ID_LENGTH
    })

    it('should not truncate if less than max', async () => {
      const conversationId350chars = 'a'.repeat(300) // Make it longer than 325

      await client.replyToActivity(conversationId350chars, 'activityId', { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.AgenticUser } } as Activity)

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

    it('should not truncate non-agentic', async () => {
      const conversationId350chars = 'a'.repeat(500) // Make it longer than 325

      await client.replyToActivity(conversationId350chars, 'activityId', { type: 'message', channelId: Channels.Msteams, from: { role: RoleTypes.User } } as Activity)

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
  })
})
