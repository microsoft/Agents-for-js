import { strict as assert } from 'assert'
import { describe, it, mock } from 'node:test'
import {
  AgentType,
  ConnectionSettings,
  CopilotStudioClient,
  PowerPlatformCloud,
  StartRequest,
  UserAgentHelper,
  ScopeHelper,
  SubscribeEvent,
  loadCopilotStudioConnectionSettingsFromEnv
} from '../src'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

const mockFailedFetchResponse = (status: number, statusText: string, bodyText: string) => {
  return {
    ok: false,
    status,
    statusText,
    headers: new Headers(),
    text: async () => bodyText
  } as unknown as Response
}

const captureRejection = async (action: () => Promise<unknown>): Promise<Error> => {
  try {
    await action()
  } catch (error) {
    if (error instanceof Error) {
      return error
    }
    return new Error(String(error))
  }

  assert.fail('Expected promise to reject, but it did not.')
}

async function consumeStream (stream: AsyncIterable<unknown>): Promise<void> {
  const iterator = stream[Symbol.asyncIterator]()
  let next = await iterator.next()
  while (!next.done) {
    next = await iterator.next()
  }
}

describe('scopeFromSettings', function () {
  function createSettings (cloud: PowerPlatformCloud, cloudBaseAddress = ''): ConnectionSettings {
    return {
      appClientId: '123',
      tenantId: 'test-tenant',
      environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
      cloud,
      agentIdentifier: 'Bot01',
      copilotAgentType: AgentType.Published,
      customPowerPlatformCloud: cloudBaseAddress
    }
  }

  it('should return scope for PowerPlatformCloud.Prod environment', function () {
    assert.equal(CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.Prod)), 'https://api.powerplatform.com/.default')
  })

  it('should return scope for PowerPlatformCloud.Preprod environment', function () {
    assert.equal(CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.Preprod)), 'https://api.preprod.powerplatform.com/.default')
  })

  it('should return scope for PowerPlatformCloud.Mooncake environment', function () {
    assert.equal(CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.Mooncake)), 'https://api.powerplatform.partner.microsoftonline.cn/.default')
  })

  it('should return scope for PowerPlatformCloud.FirstRelease environment', function () {
    assert.equal(CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.FirstRelease)), 'https://api.powerplatform.com/.default')
  })

  it('should return scope for PowerPlatformCloud.Other environment', function () {
    assert.equal(CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.Other, 'fido.com')), 'https://fido.com/.default')
  })

  it('should throw when cloud is Unknown and no cloudBaseAddress is provided', function () {
    assert.throws(() => {
      CopilotStudioClient.scopeFromSettings(createSettings(PowerPlatformCloud.Unknown))
    }, Error)
  })
})

describe('CopilotStudioClient', function () {
  const createTestSettings = (): ConnectionSettings => {
    return new ConnectionSettings({
      appClientId: 'test-app-id',
      tenantId: 'test-tenant-id',
      environmentId: 'test-env-id',
      agentIdentifier: 'test-agent',
      directConnectUrl: 'https://testenv.id.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/test-agent/conversations',
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

    it('should throw sanitized error for non-2xx start response', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const fetchMock = mock.fn(() => Promise.resolve(mockFailedFetchResponse(401, 'Unauthorized', 'sensitive-response-body test-token')))
      global.fetch = fetchMock as any

      const error = await captureRejection(() => client.startConversationAsync())
      assert.match(error.message, /Copilot Studio request failed with status 401 Unauthorized/)
      assert.doesNotMatch(error.message, /test-token/)
      assert.doesNotMatch(error.message, /sensitive-response-body/)
    })

    it('should retain the conversation ID when a later response omits the header', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const conversationId = 'header-conversation-id'
      const responses = [
        mockFetchResponse([], conversationId),
        mockFetchResponse([]),
        mockFetchResponse([]),
      ]
      const fetchMock = mock.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(responses.shift()!))
      global.fetch = fetchMock as any

      await consumeStream(client.startConversationStreaming())
      await consumeStream(client.sendActivityStreaming(Activity.fromObject({ type: ActivityTypes.Message, text: 'First message' })))
      await consumeStream(client.sendActivityStreaming(Activity.fromObject({ type: ActivityTypes.Message, text: 'Second message' })))

      assert.equal(client['conversationId'], conversationId)
      const thirdRequestUrl = String(fetchMock.mock.calls[2].arguments[0])
      assert(thirdRequestUrl.includes(`/conversations/${conversationId}`), `Expected request URL to retain conversation ID: ${thirdRequestUrl}`)
    })

    it('should replace a stale conversation ID when starting a headerless conversation', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const firstConversationId = 'first-conversation-id'
      const secondConversationId = 'second-conversation-id'
      const secondConversationActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'New conversation',
        conversation: { id: secondConversationId }
      })
      const responses = [
        mockFetchResponse([], firstConversationId),
        mockFetchResponse([secondConversationActivity]),
        mockFetchResponse([])
      ]
      const fetchMock = mock.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(responses.shift()!))
      global.fetch = fetchMock as any

      await consumeStream(client.startConversationStreaming())
      await consumeStream(client.startConversationStreaming())
      await consumeStream(client.sendActivityStreaming(Activity.fromObject({ type: ActivityTypes.Message, text: 'Follow-up' })))

      assert.equal(client['conversationId'], secondConversationId)
      const thirdRequestUrl = String(fetchMock.mock.calls[2].arguments[0])
      assert(thirdRequestUrl.includes(`/conversations/${secondConversationId}`), `Expected request URL to use the new conversation ID: ${thirdRequestUrl}`)
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

    it('should throw sanitized error for non-2xx send response', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello bot',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFailedFetchResponse(403, 'Forbidden', 'sensitive-response-body test-token')))
      global.fetch = fetchMock as any

      const error = await captureRejection(() => client.sendActivity(userActivity))
      assert.match(error.message, /Copilot Studio request failed with status 403 Forbidden/)
      assert.doesNotMatch(error.message, /test-token/)
      assert.doesNotMatch(error.message, /sensitive-response-body/)
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

  describe('Diagnostics', function () {
    it('should enable diagnostic logging when enableDiagnostics is true', function () {
      const settings = new ConnectionSettings({
        environmentId: 'test-env-id',
        agentIdentifier: 'test-agent',
        cloud: PowerPlatformCloud.Prod,
        copilotAgentType: AgentType.Published,
        enableDiagnostics: true
      })

      assert.equal(settings.enableDiagnostics, true)
    })

    it('should not enable diagnostics when enableDiagnostics is false', function () {
      const settings = new ConnectionSettings({
        environmentId: 'test-env-id',
        agentIdentifier: 'test-agent',
        enableDiagnostics: false
      })

      assert.equal(settings.enableDiagnostics, false)
    })

    it('should default enableDiagnostics to false when not provided', function () {
      const settings = new ConnectionSettings({
        environmentId: 'test-env-id',
        agentIdentifier: 'test-agent'
      })

      // enableDiagnostics should be falsy (undefined or false)
      assert.ok(!settings.enableDiagnostics)
    })

    it('should load enableDiagnostics from environment variable', function () {
      process.env.enableDiagnostics = 'true'
      process.env.environmentId = 'test-env-id'
      process.env.agentIdentifier = 'test-agent'

      const settings = loadCopilotStudioConnectionSettingsFromEnv()

      assert.equal(settings.enableDiagnostics, true)

      delete process.env.enableDiagnostics
      delete process.env.environmentId
      delete process.env.agentIdentifier
    })

    it('should handle enableDiagnostics environment variable as false', function () {
      process.env.enableDiagnostics = 'false'

      const settings = loadCopilotStudioConnectionSettingsFromEnv()

      assert.equal(settings.enableDiagnostics, false)

      delete process.env.enableDiagnostics
    })
  })

  describe('StartRequest', function () {
    it('should accept StartRequest object with locale', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const startRequest: StartRequest = {
        locale: 'fr-FR',
        emitStartConversationEvent: true
      }

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Bienvenue!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync(startRequest)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Bienvenue!')
    })

    it('should accept boolean for backward compatibility', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Welcome!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync(false)

      assert.equal(activities.length, 1)
    })

    it('should use conversationId from StartRequest if provided', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const startRequest: StartRequest = {
        conversationId: 'custom-conversation-id',
        emitStartConversationEvent: true
      }

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Welcome!',
        conversation: { id: 'custom-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity], 'custom-conversation-id')))
      global.fetch = fetchMock as any

      const activities = await client.startConversationAsync(startRequest)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].conversation?.id, 'custom-conversation-id')
    })

    it('should work with startConversationStreaming using StartRequest', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const startRequest: StartRequest = {
        locale: 'en-US',
        emitStartConversationEvent: false
      }

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity])))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.startConversationStreaming(startRequest)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Hello!')
    })

    it('should return StartResponse with metadata', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Welcome!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity], 'test-conversation-id')))
      global.fetch = fetchMock as any

      const response = await client.startConversationWithResponse()

      assert.equal(response.activities.length, 1)
      assert.equal(response.conversationId, 'test-conversation-id')
      assert.equal(response.isNewConversation, true)
    })

    it('should return StartResponse with StartRequest parameter', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const startRequest: StartRequest = {
        locale: 'fr-FR',
        emitStartConversationEvent: true
      }

      const welcomeActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Bienvenue!',
        conversation: { id: 'test-conversation-id' }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([welcomeActivity], 'test-conversation-id')))
      global.fetch = fetchMock as any

      const response = await client.startConversationWithResponse(startRequest)

      assert.equal(response.activities.length, 1)
      assert.equal(response.conversationId, 'test-conversation-id')
      assert.equal(response.isNewConversation, true)
    })
  })

  describe('ExecuteStreaming', function () {
    it('should execute turn with explicit conversation ID', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const conversationId = 'explicit-conversation-id'
      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello',
        conversation: { id: conversationId }
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hi!',
        conversation: { id: conversationId }
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.executeStreaming(userActivity, conversationId)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Hi!')
    })

    it('should use an explicitly executed conversation for later default sends', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')
      const firstConversationId = 'first-conversation-id'
      const executedConversationId = 'executed-conversation-id'
      const responses = [
        mockFetchResponse([], firstConversationId),
        mockFetchResponse([]),
        mockFetchResponse([])
      ]
      const fetchMock = mock.fn((..._args: Parameters<typeof fetch>) => Promise.resolve(responses.shift()!))
      global.fetch = fetchMock as any

      await consumeStream(client.startConversationStreaming())
      await consumeStream(client.executeStreaming(Activity.fromObject({ type: ActivityTypes.Message, text: 'Execute' }), executedConversationId))
      await consumeStream(client.sendActivityStreaming(Activity.fromObject({ type: ActivityTypes.Message, text: 'Follow-up' })))

      assert.equal(client['conversationId'], executedConversationId)
      const thirdRequestUrl = String(fetchMock.mock.calls[2].arguments[0])
      assert(thirdRequestUrl.includes(`/conversations/${executedConversationId}`), `Expected request URL to use the executed conversation ID: ${thirdRequestUrl}`)
    })

    it('should throw error if conversationId is empty', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Hello'
      })

      const error = await captureRejection(async () => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        for await (const _activity of client.executeStreaming(userActivity, '')) {
        // Should not reach here
        }
        assert.fail('Should have thrown an error')
      })

      assert.match(error.message, /conversationId is required for executeStreaming/)
    })

    it('should use deprecated execute method', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const conversationId = 'test-conversation-id'
      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question'
      })

      const responseActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Answer'
      })

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse([responseActivity])))
      global.fetch = fetchMock as any

      const activities = await client.execute(userActivity, conversationId)

      assert.equal(activities.length, 1)
      assert.equal(activities[0].text, 'Answer')
    })

    it('should return ExecuteTurnResponse with activity count', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question'
      })

      const responseActivities = [
        Activity.fromObject({ type: ActivityTypes.Typing }),
        Activity.fromObject({ type: ActivityTypes.Message, text: 'Answer 1' }),
        Activity.fromObject({ type: ActivityTypes.Message, text: 'Answer 2' })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const response = await client.executeWithResponse(userActivity, 'conv-id')

      assert.equal(response.activities.length, 3)
      assert.equal(response.activityCount, 3)
      assert.equal(response.conversationId, 'conv-id')
    })

    it('should handle multiple activities in executeStreaming', async function () {
      const settings = createTestSettings()
      const client = new CopilotStudioClient(settings, 'test-token')

      const conversationId = 'test-conversation-id'
      const userActivity = Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Question'
      })

      const responseActivities = [
        Activity.fromObject({ type: ActivityTypes.Typing }),
        Activity.fromObject({ type: ActivityTypes.Message, text: 'Answer 1' }),
        Activity.fromObject({ type: ActivityTypes.Message, text: 'Answer 2' })
      ]

      const fetchMock = mock.fn(() => Promise.resolve(mockFetchResponse(responseActivities)))
      global.fetch = fetchMock as any

      const activities: Activity[] = []
      for await (const activity of client.executeStreaming(userActivity, conversationId)) {
        activities.push(activity)
      }

      assert.equal(activities.length, 3)
      assert.equal(activities[0].type, ActivityTypes.Typing)
      assert.equal(activities[1].text, 'Answer 1')
      assert.equal(activities[2].text, 'Answer 2')
    })
  })
})

describe('UserAgentHelper', function () {
  it('should return product info string', function () {
    const productInfo = UserAgentHelper.getProductInfo()
    assert(productInfo.includes('CopilotStudioClient.agents-sdk-js/'))
  })

  it('should return version string', function () {
    const versionString = UserAgentHelper.getVersionString()
    assert(versionString.startsWith('CopilotStudioClient.agents-sdk-js/'))
  })

  it('should return version number', function () {
    const version = UserAgentHelper.getVersion()
    assert(version.match(/^\d+\.\d+\.\d+/))
  })

  it('should include platform info in Node.js', function () {
    const productInfo = UserAgentHelper.getProductInfo()
    if (!('window' in globalThis)) {
      assert(productInfo.includes('nodejs/'))
    }
  })
})

describe('ScopeHelper', function () {
  it('should return correct scope for Prod cloud', function () {
    const settings = new ConnectionSettings({
      environmentId: 'env-id',
      agentIdentifier: 'agent',
      cloud: PowerPlatformCloud.Prod
    })

    const scope = ScopeHelper.getScopeFromSettings(settings)
    assert.equal(scope, 'https://api.powerplatform.com/.default')
  })

  it('should return correct scope for Gov cloud', function () {
    const settings = new ConnectionSettings({
      environmentId: 'env-id',
      agentIdentifier: 'agent',
      cloud: PowerPlatformCloud.Gov
    })

    const scope = ScopeHelper.getScopeFromSettings(settings)
    assert.equal(scope, 'https://api.gov.powerplatform.microsoft.us/.default')
  })

  it('should match static method on CopilotStudioClient', function () {
    const settings = new ConnectionSettings({
      environmentId: 'env-id',
      agentIdentifier: 'agent',
      cloud: PowerPlatformCloud.Prod
    })

    const scope1 = ScopeHelper.getScopeFromSettings(settings)
    const scope2 = CopilotStudioClient.scopeFromSettings(settings)

    assert.equal(scope1, scope2)
  })
})

describe('subscribeAsync', function () {
  const createTestSettings = (): ConnectionSettings => {
    return new ConnectionSettings({
      appClientId: 'test-app-id',
      tenantId: 'test-tenant-id',
      environmentId: 'test-env-id',
      agentIdentifier: 'test-agent',
      directConnectUrl: 'https://testenv.id.environment.api.powerplatform.com/copilotstudio/dataverse-backed/authenticated/bots/test-agent/conversations',
      cloud: PowerPlatformCloud.Prod,
      copilotAgentType: AgentType.Published
    })
  }

  const mockSubscribeFetchResponse = (activities: Activity[], eventIds?: string[]) => {
    const mockHeaders = new Headers()
    mockHeaders.set('x-ms-conversationid', 'test-conversation-id')

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
                const activity = activities[index]
                const eventId = eventIds?.[index] || `event-${index}`
                index++
                const data = `id: ${eventId}\nevent: activity\ndata: ${activity.toJsonString()}\n\n`
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

  it('should subscribe to conversation and receive events', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const conversationId = 'test-conversation-id'
    const activities = [
      Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Event 1',
        conversation: { id: conversationId }
      }),
      Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Event 2',
        conversation: { id: conversationId }
      })
    ]

    const fetchMock = mock.fn(() => Promise.resolve(mockSubscribeFetchResponse(activities, ['evt-1', 'evt-2'])))
    global.fetch = fetchMock as any

    const events: SubscribeEvent[] = []
    for await (const event of client.subscribeAsync(conversationId)) {
      events.push(event)
    }

    assert.equal(events.length, 2)
    assert.equal(events[0].activity.text, 'Event 1')
    assert.equal(events[0].eventId, 'evt-1')
    assert.equal(events[1].activity.text, 'Event 2')
    assert.equal(events[1].eventId, 'evt-2')
  })

  it('should throw error if conversationId is empty', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const error = await captureRejection(async () => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _event of client.subscribeAsync('')) {
        // Should not reach here
      }
      assert.fail('Should have thrown an error')
    })

    assert.match(error.message, /conversationId is required for subscribeAsync/)
  })

  it('should include Last-Event-ID header when resuming', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const conversationId = 'test-conversation-id'
    const lastEventId = 'last-event-123'

    const activities = [
      Activity.fromObject({
        type: ActivityTypes.Message,
        text: 'Resumed event',
        conversation: { id: conversationId }
      })
    ]

    const fetchMock = mock.fn(() => Promise.resolve(mockSubscribeFetchResponse(activities, ['evt-resumed'])))
    global.fetch = fetchMock as any

    const events: SubscribeEvent[] = []
    for await (const event of client.subscribeAsync(conversationId, lastEventId)) {
      events.push(event)
    }

    assert.equal(events.length, 1)
    assert.equal(events[0].eventId, 'evt-resumed')
  })

  it('should handle empty subscription stream', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const conversationId = 'test-conversation-id'

    const fetchMock = mock.fn((url: string | URL | Request) => Promise.resolve(mockSubscribeFetchResponse([])))
    global.fetch = fetchMock as any

    const events: SubscribeEvent[] = []
    for await (const event of client.subscribeAsync(conversationId)) {
      events.push(event)
    }

    assert.equal(events.length, 0)
  })

  it('should use subscribe URL endpoint', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const conversationId = 'test-conversation-id'

    const fetchMock = mock.fn(() => Promise.resolve(mockSubscribeFetchResponse([])))
    global.fetch = fetchMock as any

    const events: SubscribeEvent[] = []
    for await (const event of client.subscribeAsync(conversationId)) {
      events.push(event)
    }

    // Verify that the fetch was called with a URL ending in /subscribe
    assert(fetchMock.mock.calls.length > 0)
    const calls = fetchMock.mock.calls as unknown as Array<{ arguments: [string | URL | Request] }>
    const callUrl = calls[0]?.arguments[0]
    assert(String(callUrl).includes('/subscribe'), `URL should contain /subscribe: ${String(callUrl)}`)
  })

  it('should throw sanitized error for non-2xx subscribe response', async function () {
    const settings = createTestSettings()
    const client = new CopilotStudioClient(settings, 'test-token')

    const conversationId = 'test-conversation-id'
    const fetchMock = mock.fn(() => Promise.resolve(mockFailedFetchResponse(500, 'Internal Server Error', 'sensitive-response-body test-token')))
    global.fetch = fetchMock as any

    const error = await captureRejection(async () => {
      for await (const event of client.subscribeAsync(conversationId)) {
        assert.fail(`Should not receive subscription event ${event.eventId}`)
      }
    })
    assert.match(error.message, /Copilot Studio request failed with status 500 Internal Server Error/)
    assert.doesNotMatch(error.message, /test-token/)
    assert.doesNotMatch(error.message, /sensitive-response-body/)
  })
})

describe('shared client conversation isolation', () => {
  function signal () {
    let complete!: () => void
    const promise = new Promise<void>((resolve) => { complete = resolve })
    return { promise, resolve: complete }
  }

  function startResponse (id?: string, activity?: object) {
    const reading = signal()
    const finish = signal()
    let sentActivity = false
    const body = new ReadableStream<Uint8Array>({
      async pull (controller) {
        reading.resolve()
        if (activity && !sentActivity) {
          sentActivity = true
          controller.enqueue(new TextEncoder().encode(`event: activity\ndata: ${JSON.stringify(activity)}\n\n`))
          return
        }
        await finish.promise
        controller.enqueue(new TextEncoder().encode('event: end\ndata: done\n\n'))
        controller.close()
      }
    })
    return {
      reading,
      finish,
      response: new Response(body, {
        headers: { 'Content-Type': 'text/event-stream', ...(id && { 'x-ms-conversationid': id }) }
      })
    }
  }

  function client () {
    return new CopilotStudioClient({ directConnectUrl: 'https://fixture.example/api' }, 'test-token')
  }

  it('streams startup activities before returning header metadata', async (t) => {
    const response = startResponse('header-A', { type: 'message', text: 'Hello', conversation: { id: 'activity-A' } })
    t.mock.method(globalThis, 'fetch', async () => response.response)
    const stream = client().startConversationStreaming({ locale: 'fr-FR' })
    try {
      const first = await stream.next()
      assert.equal(first.done, false)
      assert.equal(first.value.text, 'Hello')
      response.finish.resolve()
      const final = await stream.next()
      assert.equal(final.done, true)
      assert.equal(final.value, 'header-A')
    } finally {
      response.finish.resolve()
      await stream.return(undefined)
    }
  })

  it('uses a non-message activity ID when the header is absent', async (t) => {
    const response = startResponse(undefined, { type: 'event', name: 'ready', conversation: { id: 'event-A' } })
    response.finish.resolve()
    t.mock.method(globalThis, 'fetch', async () => response.response)
    const result = await client().startConversationWithResponse(false)
    assert.equal(result.conversationId, 'event-A')
  })

  it('closes the request when startup streaming is stopped early', async (t) => {
    const response = startResponse('A', { type: 'message', text: 'Hello', conversation: { id: 'A' } })
    let requestSignal: AbortSignal | null | undefined
    t.mock.method(globalThis, 'fetch', async (_url: string | URL | Request, init?: RequestInit) => {
      requestSignal = init?.signal
      return response.response
    })
    const stream = client().startConversationStreaming()
    try {
      const first = await stream.next()
      assert.equal(first.done, false)
      assert.equal(requestSignal?.aborted, false)
      await stream.return(undefined)
      assert.equal(requestSignal?.aborted, true)
    } finally {
      response.finish.resolve()
      await stream.return(undefined)
    }
  })

  it('uses the supplied start ID when the response has no ID', async (t) => {
    const response = startResponse()
    response.finish.resolve()
    t.mock.method(globalThis, 'fetch', async () => response.response)
    const result = await client().startConversationWithResponse({ conversationId: 'supplied-A', emitStartConversationEvent: false })
    assert.equal(result.conversationId, 'supplied-A')
  })

  it('prefers a response activity ID over a supplied start ID', async (t) => {
    const response = startResponse(undefined, { type: 'message', text: 'Hello', conversation: { id: 'server-A' } })
    response.finish.resolve()
    t.mock.method(globalThis, 'fetch', async () => response.response)
    const result = await client().startConversationWithResponse({ conversationId: 'requested-A' })
    assert.equal(result.conversationId, 'server-A')
  })

  it('preserves implicit default updates for startup streaming', async (t) => {
    const responses = [startResponse('legacy-A'), startResponse('stream-B'), startResponse('stream-B')]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const shared = client()
    await shared.startConversationWithResponse(false)
    const streamed = await shared.startConversationStreaming(false).next()
    assert.equal(streamed.done, true)
    assert.equal(streamed.value, 'stream-B')
    await shared.sendActivity(Activity.fromObject({ type: 'message', text: 'Legacy follow-up' }))
    assert.match(String(fetchMock.mock.calls[2].arguments[0]), /\/conversations\/stream-B\?/)
  })

  it('preserves empty-ID start results without borrowing a prior conversation', async (t) => {
    const responses = [startResponse('prior-A'), startResponse()]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const shared = client()
    await shared.startConversationAsync(false)
    const result = await shared.startConversationWithResponse(false)
    assert.equal(result.conversationId, '')
    assert.deepEqual(result.activities, [])
  })

  it('preserves activity-ID precedence and the header-based implicit default', async (t) => {
    const responses = [
      startResponse('header-A', { type: 'message', text: 'Hello', conversation: { id: 'activity-A' } }),
      startResponse('header-A')
    ]
    responses.forEach(response => response.finish.resolve())
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
    const shared = client()
    const result = await shared.startConversationWithResponse()
    assert.equal(result.conversationId, 'activity-A')
    await shared.sendActivity(Activity.fromObject({ type: 'message', text: 'Follow-up' }))
    assert.match(String(fetchMock.mock.calls[1].arguments[0]), /\/conversations\/header-A\?/)
  })

  for (const finishFirst of [0, 1]) {
    it(`returns request-local header IDs when start ${finishFirst + 1} finishes first`, async (t) => {
      const responses = [startResponse('A'), startResponse('B')]
      let index = 0
      t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
      const shared = client()
      const starts = [shared.startConversationWithResponse(false), shared.startConversationWithResponse(false)]
      try {
        await Promise.all(responses.map(response => response.reading.promise))
        responses[finishFirst].finish.resolve()
        await starts[finishFirst]
        responses[1 - finishFirst].finish.resolve()
        const [a, b] = await Promise.all(starts)
        assert.equal(a.conversationId, 'A')
        assert.equal(b.conversationId, 'B')
        assert.deepEqual(a.activities, [])
        assert.deepEqual(b.activities, [])
      } finally {
        responses.forEach(response => response.finish.resolve())
        await Promise.allSettled(starts)
      }
    })
  }

  it('keeps a pending start ID isolated from an explicit continuation response', async (t) => {
    const a = startResponse('A')
    const b = startResponse('B')
    b.finish.resolve()
    let index = 0
    const fetchMock = t.mock.method(globalThis, 'fetch', async () => [a, b][index++].response)
    const shared = client()
    const pending = shared.startConversationWithResponse(false)
    try {
      await a.reading.promise
      await shared.executeWithResponse(Activity.fromObject({ type: 'message', text: 'B' }), 'B')
      a.finish.resolve()
      assert.equal((await pending).conversationId, 'A')
      assert.match(String(fetchMock.mock.calls[1].arguments[0]), /\/conversations\/B\?/)
    } finally {
      a.finish.resolve()
      await Promise.allSettled([pending])
    }
  })

  it('routes concurrent explicit sends independently in the URL and request body', async (t) => {
    const responses = [startResponse('A'), startResponse('B')]
    let index = 0
    const requests: { url: string, id: string }[] = []
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), id: JSON.parse(String(init?.body)).conversationId })
      return responses[index++].response
    })
    const shared = client()
    const turns = ['A', 'B'].map(id => shared.executeWithResponse(Activity.fromObject({ type: 'message', text: id }), id))
    try {
      await Promise.all(responses.map(response => response.reading.promise))
      responses[1].finish.resolve()
      await turns[1]
      responses[0].finish.resolve()
      assert.deepEqual((await Promise.all(turns)).map(result => result.conversationId), ['A', 'B'])
      assert.deepEqual(requests.map(request => request.id), ['A', 'B'])
      assert.match(requests[0].url, /\/conversations\/A\?/)
      assert.match(requests[1].url, /\/conversations\/B\?/)
    } finally {
      responses.forEach(response => response.finish.resolve())
      await Promise.allSettled(turns)
    }
  })

  it('preserves start overrides when returning conversation metadata', async (t) => {
    const shared = client()
    t.mock.method(shared, 'startConversationStreaming', async function * () {
      yield Activity.fromObject({ type: 'message', text: 'Custom start', conversation: { id: 'custom-A' } })
    })
    const result = await shared.startConversationWithResponse()
    assert.equal(result.conversationId, 'custom-A')
    assert.equal(result.activities[0].text, 'Custom start')
  })

  it('does not borrow the default when a start override discards metadata', async (t) => {
    const response = startResponse('custom-header-A')
    response.finish.resolve()
    t.mock.method(globalThis, 'fetch', async () => response.response)
    const shared = client()
    const originalStart = shared.startConversationStreaming.bind(shared)
    t.mock.method(shared, 'startConversationStreaming', async function * () {
      yield * originalStart()
    })

    const result = await shared.startConversationWithResponse()

    assert.equal(result.conversationId, '')
    assert.equal(result.activities.length, 0)
  })

  for (const forwardMetadata of [false, true]) {
    for (const finishFirst of [0, 1]) {
      it(`isolates overridden starts with forwarding=${forwardMetadata}, first=${finishFirst}`, async (t) => {
        const responses = [startResponse('A'), startResponse('B')]
        let index = 0
        t.mock.method(globalThis, 'fetch', async () => responses[index++].response)
        const shared = client()
        const originalStart = shared.startConversationStreaming.bind(shared)
        t.mock.method(shared, 'startConversationStreaming', async function * () {
          await Promise.resolve()
          const id = yield * originalStart()
          if (forwardMetadata) {
            return id
          }
        })
        const starts = [shared.startConversationWithResponse(), shared.startConversationWithResponse()]
        try {
          await Promise.all(responses.map(response => response.reading.promise))
          responses[finishFirst].finish.resolve()
          await starts[finishFirst]
          responses[1 - finishFirst].finish.resolve()
          const results = await Promise.all(starts)
          assert.deepEqual(results.map(result => result.conversationId), forwardMetadata ? ['A', 'B'] : ['', ''])
          assert.deepEqual(results.map(result => result.activities), [[], []])
        } finally {
          responses.forEach(response => response.finish.resolve())
          await Promise.allSettled(starts)
        }
      })
    }
  }
})
