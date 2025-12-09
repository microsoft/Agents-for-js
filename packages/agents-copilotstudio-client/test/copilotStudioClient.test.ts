import { strict as assert } from 'assert'
import { describe, it, mock } from 'node:test'
import { AgentType, ConnectionSettings, CopilotStudioClient, PowerPlatformCloud } from '../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

describe('scopeFromSettings', function () {
  const testCases: Array<{
    label: string
    cloud: PowerPlatformCloud
    cloudBaseAddress: string
    expectedAuthority: string
    shouldthrow: boolean
  }> = [
    {
      label: 'Should return scope for PowerPlatformCloud.Prod environment',
      cloud: PowerPlatformCloud.Prod,
      cloudBaseAddress: '',
      expectedAuthority: 'https://api.powerplatform.com/.default',
      shouldthrow: false
    },
    {
      label: 'Should return scope for PowerPlatformCloud.Preprod environment',
      cloud: PowerPlatformCloud.Preprod,
      cloudBaseAddress: '',
      expectedAuthority: 'https://api.preprod.powerplatform.com/.default',
      shouldthrow: false
    },
    {
      label: 'Should return scope for PowerPlatformCloud.Mooncake environment',
      cloud: PowerPlatformCloud.Mooncake,
      cloudBaseAddress: '',
      expectedAuthority: 'https://api.powerplatform.partner.microsoftonline.cn/.default',
      shouldthrow: false
    },
    {
      label: 'Should return scope for PowerPlatformCloud.FirstRelease environment',
      cloud: PowerPlatformCloud.FirstRelease,
      cloudBaseAddress: '',
      expectedAuthority: 'https://api.powerplatform.com/.default',
      shouldthrow: false
    },
    {
      label: 'Should return scope for PowerPlatformCloud.Other environment',
      cloud: PowerPlatformCloud.Other,
      cloudBaseAddress: 'fido.com',
      expectedAuthority: 'https://fido.com/.default',
      shouldthrow: false
    },
    {
      label: 'Should throw when cloud is Unknown and no cloudBaseAddress is provided',
      cloud: PowerPlatformCloud.Unknown,
      cloudBaseAddress: '',
      expectedAuthority: '',
      shouldthrow: true
    }
  ]

  testCases.forEach((testCase) => {
    it(testCase.label, function () {
      const settings: ConnectionSettings = {
        appClientId: '123',
        tenantId: 'test-tenant',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        cloud: testCase.cloud,
        agentIdentifier: 'Bot01',
        copilotAgentType: AgentType.Published,
        customPowerPlatformCloud: testCase.cloudBaseAddress
      }

      if (testCase.shouldthrow) {
        assert.throws(() => {
          CopilotStudioClient.scopeFromSettings(settings)
        }, Error)
      } else {
        const scope = CopilotStudioClient.scopeFromSettings(settings)
        assert(scope === testCase.expectedAuthority)
      }
    })
  })
})

describe('CopilotStudioClient', function () {
  const createTestSettings = (): ConnectionSettings => {
    return new ConnectionSettings({
      appClientId: 'test-app-id',
      tenantId: 'test-tenant-id',
      environmentId: 'test-env-id',
      agentIdentifier: 'test-agent',
      cloud: PowerPlatformCloud.Prod,
      copilotAgentType: AgentType.Published
    })
  }

  const mockFetchResponse = (activities: Activity[], conversationId?: string) => {
    const mockHeaders = new Headers()
    if (conversationId) {
      mockHeaders.set('x-ms-conversationid', conversationId)
    }
    const mockResponse = {
      ok: true,
      status: 200,
      headers: mockHeaders,
      body: {
        getReader: () => {
          const encoder = new TextEncoder()
          let index = 0

          return {
            read: async () => {
              if (index < activities.length) {
                const activity = activities[index++]
                const data = `event: activity\ndata: ${activity.toJsonString()}\n\n`
                return {
                  done: false,
                  value: encoder.encode(data)
                }
              } else if (index === activities.length) {
                index++
                const data = 'event: end\ndata: \n\n'
                return {
                  done: false,
                  value: encoder.encode(data)
                }
              } else {
                return { done: true, value: undefined }
              }
            }
          }
        }
      }
    }

    return mockResponse as unknown as Response
  }

  describe('startConversationAsync', function () {
    it('should start a conversation and return activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Welcome!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync()

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Welcome!')
      assert.equal(activities[0].type, ActivityTypes.Message)
      assert(fetchMock.mock.calls.length > 0)
    })

    it('should start a conversation with emitStartConversationEvent set to false', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello!',
        conversation: { id: 'test-conversation-id-2' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync(false)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Hello!')
      assert(fetchMock.mock.calls.length > 0)
    })

    it('should handle multiple activities in response', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const activities = [
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'First message',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Second message',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(activities)))
      global.fetch = fetchMock as any

      const result = await client.startConversationAsync()

      assert.equal(result.length, 3)
      assert.equal(result[0].text, 'First message')
      assert.equal(result[1].text, 'Second message')
      assert.equal(result[2].type, ActivityTypes.Typing)
    })

    it('should handle empty response', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([])))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync()

      assert.equal(activities.length, 0)
    })

    it('should set conversation ID from response headers', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const expectedConversationId = 'header-conversation-id'

      const activity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Test',
        conversation: { id: 'not-expected-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([activity], expectedConversationId)))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync()

      assert.equal(activities.length, 1)
      assert.equal(activities[0].conversation?.id, 'not-expected-conversation-id')
      assert.equal(client['conversationId'], expectedConversationId)
    })
  })

  describe('sendActivity', function () {
    it('should send an activity and return response activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello bot',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello user!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities = await client.sendActivity(userActivity)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Hello user!')
      assert(fetchMock.mock.calls.length > 0)
    })

    it('should handle multiple response activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'First part',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Second part',
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities = await client.sendActivity(userActivity)

      assert.equal(activities.length, 3)
      assert.equal(activities[0].type, ActivityTypes.Typing)
      assert.equal(activities[1].text, 'First part')
      assert.equal(activities[2].text, 'Second part')
    })

    it('should handle non-message activity types', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Event,
        name: 'customEvent',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Event,
        name: 'responseEvent',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities = await client.sendActivity(userActivity)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].type, ActivityTypes.Event)
      assert.equal(activities[0].name, 'responseEvent')
    })

    it('should handle empty response from sendActivity', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Test',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([])))
      global.fetch = fetchMock as any

      const activities = await client.sendActivity(userActivity)

      assert.equal(activities.length, 0)
    })

    it('should use conversation ID from activity if provided', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const activityConversationId = 'activity-conversation-id'

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Test',
        conversation: { id: activityConversationId }
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Response',
        conversation: { id: activityConversationId }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities = await client.sendActivity(userActivity)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].conversation?.id, activityConversationId)
      assert.equal(client['conversationId'], activityConversationId)
    })
  })

  describe('startConversationStreaming (AsyncGenerator)', function () {
    it('should stream activities as AsyncGenerator', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Welcome!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.startConversationStreaming()) {
        activities.push(activity)
      }

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Welcome!')
      assert.equal(activities[0].type, ActivityTypes.Message)
    })

    it('should stream multiple activities in order', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const activityList = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'First',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Second',
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(activityList)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.startConversationStreaming()) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].type, ActivityTypes.Typing)
      assert.equal(activities[1].text, 'First')
      assert.equal(activities[2].text, 'Second')
    })

    it('should support early termination of AsyncGenerator', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const activityList = [
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'First',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Second',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Third',
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(activityList)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.startConversationStreaming()) {
        activities.push(activity)
        if (activities.length === 2) {
          break // Early termination
        }
      }

      assert.equal(activities.length, 2)
      assert.equal(activities[0].text, 'First')
      assert.equal(activities[1].text, 'Second')
    })
  })

  describe('sendActivityStreaming (AsyncGenerator)', function () {
    it('should stream response activities as AsyncGenerator', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hi there!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Hi there!')
    })

    it('should stream multiple response activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Thinking...',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Here is your answer',
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].type, ActivityTypes.Typing)
      assert.equal(activities[1].text, 'Thinking...')
      assert.equal(activities[2].text, 'Here is your answer')
    })
  })

  describe('text accumulation with streaminfo entity', function () {
    it('should accumulate text chunks with streaminfo entity', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Tell me a story',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Once',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' upon',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' a time',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 3
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'Once')
      assert.equal(activities[1].text, 'Once upon')
      assert.equal(activities[2].text, 'Once upon a time')
    })

    it('should handle out-of-order sequence numbers', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'First',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Third',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 3
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Second',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'First')
      assert.equal(activities[1].text, 'FirstThird')
      assert.equal(activities[2].text, 'FirstSecondThird')
    })

    it('should handle multiple streams independently', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId1 = 'stream-1'
      const streamId2 = 'stream-2'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Hello',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId1,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'World',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId2,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' there',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId1,
            streamSequence: 2
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: '!',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId2,
            streamSequence: 2
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 4)
      assert.equal(activities[0].text, 'Hello')
      assert.equal(activities[1].text, 'World')
      assert.equal(activities[2].text, 'Hello there')
      assert.equal(activities[3].text, 'World!')
    })

    it('should not accumulate text for non-streaming activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'First',
          conversation: { id: 'test-conversation-id' }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Second',
          conversation: { id: 'test-conversation-id' }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 2)
      assert.equal(activities[0].text, 'First')
      assert.equal(activities[1].text, 'Second')
    })
  })

  describe('text accumulation with channelData', function () {
    it('should accumulate text chunks with channelData.streamType', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Tell me a joke',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Why',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' did',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' the chicken',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 3
          }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'Why')
      assert.equal(activities[1].text, 'Why did')
      assert.equal(activities[2].text, 'Why did the chicken')
    })

    it('should handle channelData out-of-order sequence', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'A',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'C',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 3
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'B',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'A')
      assert.equal(activities[1].text, 'AC')
      assert.equal(activities[2].text, 'ABC')
    })

    it('should handle mixed channelData and streaminfo entity', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId1 = 'stream-1'
      const streamId2 = 'stream-2'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Entity',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId1,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Channel',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId: streamId2,
            streamSequence: 1
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' stream',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: streamId1,
            streamSequence: 2
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' data',
          conversation: { id: 'test-conversation-id' },
          channelData: {
            streamType: 'streaming',
            streamId: streamId2,
            streamSequence: 2
          }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 4)
      assert.equal(activities[0].text, 'Entity')
      assert.equal(activities[1].text, 'Channel')
      assert.equal(activities[2].text, 'Entity stream')
      assert.equal(activities[3].text, 'Channel data')
    })

    it('should prefer entity streaminfo over channelData when both present', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const entityStreamId = 'entity-stream'
      const channelStreamId = 'channel-stream'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'First',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: entityStreamId,
            streamSequence: 1
          }],
          channelData: {
            streamType: 'streaming',
            streamId: channelStreamId,
            streamSequence: 20
          }
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Second',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: entityStreamId,
            streamSequence: 2
          }],
          channelData: {
            streamType: 'streaming',
            streamId: channelStreamId,
            streamSequence: 10
          }
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      // Should use entity streaminfo, not channelData
      assert.equal(activities.length, 2)
      assert.equal(activities[0].text, 'First')
      assert.equal(activities[1].text, 'FirstSecond') // Accumulated using entity stream
    })
  })

  describe('text accumulation edge cases', function () {
    it('should handle empty text in streaming chunks', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Hello',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: '',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: ' world',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 3
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      // Empty text is not accumulated (due to 'if (text && id && sequence)' check)
      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'Hello')
      assert.equal(activities[1].text, 'Hello') // Empty text is not accumulated, so activity.text remains the same as before
      assert.equal(activities[2].text, 'Hello world') // Only accumulated from seq 1 and 3
    })

    it('should handle missing streamId or streamSequence', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Valid',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: 'stream-1',
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Missing sequence',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId: 'stream-1'
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Typing,
          text: 'Missing streamId',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamSequence: 2
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }
      // Activities with missing streamId or streamSequence are not accumulated
      // (due to 'if (text && id && sequence)' check)
      assert.equal(activities.length, 3)
      assert.equal(activities[0].text, 'Valid')
      assert.equal(activities[1].text, 'Missing sequence') // Not accumulated
      assert.equal(activities[2].text, 'Missing streamId') // Not accumulated
    })

    it('should not accumulate for Message type activities', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question',
        conversation: { id: 'test-conversation-id' }
      })

      const streamId = 'stream-1'
      const responseActivities = [
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'First',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 1
          }]
        }),
        Activity.fromObject({
          type: ActivityTypes.Message,
          text: 'Second',
          conversation: { id: 'test-conversation-id' },
          entities: [{
            type: 'streaminfo',
            streamType: 'streaming',
            streamId,
            streamSequence: 2
          }]
        })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.sendActivityStreaming(userActivity)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 2)
      assert.equal(activities[0].text, 'First')
      assert.equal(activities[1].text, 'Second')
    })
  })
})
