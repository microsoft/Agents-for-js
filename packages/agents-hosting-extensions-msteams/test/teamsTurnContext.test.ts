import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { AgentApplication, type AuthProvider, type Authorization, type Connections, TurnContext } from '@microsoft/agents-hosting'
import { Client as GraphClient, type ClientOptions } from '@microsoft/microsoft-graph-client'
import type { ChannelData } from '@microsoft/teams.api'
import { setTeamsApiClient } from '../src/teamsApiClientExtensions'
import { TeamsTurnContext } from '../src/teamsTurnContext'

function createContext (channelId: string = 'msteams', withConnectorClient: boolean = true, serviceUrl: string | undefined = 'https://service.example.com'): TurnContext {
  const context = new TurnContext(
    {
      ConnectorClientKey: Symbol('ConnectorClient'),
      async sendActivities (_context: TurnContext, activities: Activity[]) {
        return activities.map((_activity, index) => ({ id: `activity-${index}` }))
      }
    } as any,
    Activity.fromObject({
      type: 'message',
      channelId,
      serviceUrl,
      conversation: { id: 'conversation-id', isGroup: true },
      recipient: { id: 'bot' },
      from: { id: 'user' }
    }),
    { aud: 'api://agent' }
  )

  if (withConnectorClient) {
    context.turnState.set(context.adapter.ConnectorClientKey, {
      httpClient: {
        baseURL: 'https://connector.example.com',
        defaultHeaders: {
          Authorization: 'Bearer token',
          'User-Agent': 'test-agent'
        }
      }
    })
  }

  return context
}

async function withCapturedGraphClientOptions (
  callback: (getOptions: () => ClientOptions | undefined, expectedClient: GraphClient) => Promise<void>
): Promise<void> {
  const graph = GraphClient as unknown as { initWithMiddleware: (options: ClientOptions) => GraphClient }
  const originalInitWithMiddleware = graph.initWithMiddleware
  const expectedClient = {} as GraphClient
  let graphOptions: ClientOptions | undefined

  graph.initWithMiddleware = (options) => {
    graphOptions = options
    return expectedClient
  }

  try {
    await callback(() => graphOptions, expectedClient)
  } finally {
    graph.initWithMiddleware = originalInitWithMiddleware
  }
}

describe('TeamsTurnContext', () => {
  it('should expose the Teams client from the current turn', () => {
    const context = createContext()

    setTeamsApiClient(context)
    const teamsContext = new TeamsTurnContext(context)

    assert.strictEqual(teamsContext.client.serviceUrl, 'https://service.example.com')
  })

  it('should fall back to ConnectorClient baseURL when activity serviceUrl is missing', () => {
    const context = createContext()
    context.activity.serviceUrl = undefined

    setTeamsApiClient(context)
    const teamsContext = new TeamsTurnContext(context)

    assert.strictEqual(teamsContext.client.serviceUrl, 'https://connector.example.com')
  })

  it('should not create a client for non-Teams activities', () => {
    const context = createContext('emulator')

    setTeamsApiClient(context)

    assert.throws(() => new TeamsTurnContext(context).client, /Teams API client is not available/)
  })

  it('should throw a setup error when running on Teams channel without ConnectorClient', () => {
    const context = createContext('msteams', false)

    assert.throws(() => {
      setTeamsApiClient(context)
    }, /Teams API client setup failed: missing ConnectorClient in turnState/)
  })

  it('should throw a setup error when serviceUrl and connector baseURL are both missing', () => {
    const context = createContext()
    context.activity.serviceUrl = undefined
    const connectorClient = context.turnState.get<any>(context.adapter.ConnectorClientKey)
    connectorClient.httpClient.baseURL = ''

    assert.throws(() => {
      setTeamsApiClient(context)
    }, /Teams API client setup failed: missing activity.serviceUrl and ConnectorClient baseURL/)
  })

  it('should create Teams turn contexts over the same turn state', () => {
    const context = createContext()

    setTeamsApiClient(context)

    assert.strictEqual(new TeamsTurnContext(context).client, new TeamsTurnContext(context).client)
  })

  it('should expose the original activity with typed Teams channel data', () => {
    const context = createContext()
    context.activity.channelData = { eventType: 'channelCreated', team: { id: 'team-id' } }
    const teamsContext = new TeamsTurnContext(context)

    const channelData: ChannelData | undefined = teamsContext.activity.channelData

    assert.strictEqual(teamsContext.activity, context.activity)
    assert.strictEqual(channelData?.eventType, 'channelCreated')
    assert.strictEqual(channelData?.team?.id, 'team-id')
  })

  it('should keep activity mutations synchronized with the wrapped context', () => {
    const context = createContext()
    const teamsContext = new TeamsTurnContext(context)

    teamsContext.activity.channelData = { eventType: 'teamRenamed' }

    assert.strictEqual(context.activity.channelData, teamsContext.activity.channelData)
    assert.strictEqual(context.activity.channelData.eventType, 'teamRenamed')
  })

  it('should override the parent TurnContext responded property', () => {
    const context = createContext()
    const teamsContext = new TeamsTurnContext(context)

    assert.strictEqual(context.responded, false)
    assert.strictEqual(teamsContext.responded, false)

    teamsContext.responded = true

    assert.strictEqual(teamsContext.responded, true)
    assert.strictEqual(context.responded, true)
  })

  it('should send a cloned targeted activity to the explicit recipient without mutating the caller activity', async () => {
    const sentActivities: Activity[] = []
    const context = createContext()
    context.adapter.sendActivities = async (_context: TurnContext, activities: Activity[]) => {
      sentActivities.push(...activities)
      return [{ id: 'sent-id' }]
    }

    setTeamsApiClient(context)
    const teamsContext = new TeamsTurnContext(context)
    const activity = Activity.fromObject({
      type: 'message',
      channelId: 'msteams',
      conversation: { id: 'conversation-id', isGroup: true },
      recipient: { id: 'original-user' },
      text: 'hello'
    })

    const response = await teamsContext.sendTargetedActivity(activity, { id: 'target-user', name: 'Target User' })

    assert.strictEqual(response?.id, 'sent-id')
    assert.strictEqual(activity.isTargetedActivity(), false)
    assert.strictEqual(activity.recipient?.id, 'original-user')
    assert.strictEqual(sentActivities[0].isTargetedActivity(), true)
    assert.deepStrictEqual(sentActivities[0].recipient, { id: 'target-user', name: 'Target User' })
  })

  it('should send text as a targeted message to a recipient ID', async () => {
    const sentActivities: Activity[] = []
    const context = createContext()
    context.adapter.sendActivities = async (_context: TurnContext, activities: Activity[]) => {
      sentActivities.push(...activities)
      return [{ id: 'sent-id' }]
    }

    setTeamsApiClient(context)
    const teamsContext = new TeamsTurnContext(context)

    await teamsContext.sendTargetedActivity('hello', 'target-user')

    assert.strictEqual(sentActivities[0].text, 'hello')
    assert.deepStrictEqual(sentActivities[0].recipient, { id: 'target-user', role: 'user' })
    assert.strictEqual(sentActivities[0].isTargetedActivity(), true)
  })

  it('should send a targeted activity outside a group conversation', async () => {
    const sentActivities: Activity[] = []
    const context = createContext()
    context.adapter.sendActivities = async (_context: TurnContext, activities: Activity[]) => {
      sentActivities.push(...activities)
      return [{ id: 'sent-id' }]
    }

    setTeamsApiClient(context)
    const teamsContext = new TeamsTurnContext(context)
    const activity = Activity.fromObject({ type: 'message', channelId: 'msteams', conversation: { id: 'conversation-id', isGroup: false } })

    const response = await teamsContext.sendTargetedActivity(activity, 'target-user')

    assert.strictEqual(response?.id, 'sent-id')
    assert.strictEqual(sentActivities[0].isTargetedActivity(), true)
    assert.deepStrictEqual(sentActivities[0].recipient, { id: 'target-user', role: 'user' })
  })

  it('should reject missing or empty targeted activity arguments', async () => {
    const teamsContext = new TeamsTurnContext(createContext())

    await assert.rejects(
      () => teamsContext.sendTargetedActivity('  ', 'target-user'),
      /activity parameter must be a non-empty string/
    )
    await assert.rejects(
      () => teamsContext.sendTargetedActivity('hello', ''),
      /recipient parameter must be a non-empty string/
    )
    await assert.rejects(
      () => teamsContext.sendTargetedActivity(null as unknown as Activity, 'target-user'),
      /activity parameter is required to send a targeted activity/
    )
  })

  it('should normalize prompt-preview responses without mutating caller activities', async () => {
    const sentActivities: Activity[] = []
    const context = createContext()
    context.activity.id = 'inbound-message'
    context.activity.recipient = { id: 'bot', isTargeted: true }
    context.adapter.sendActivities = async (_context: TurnContext, activities: Activity[]) => {
      sentActivities.push(...activities)
      return activities.map((_activity, index) => ({ id: `sent-${index}` }))
    }
    const teamsContext = new TeamsTurnContext(context)
    const response = Activity.fromObject({
      type: 'message',
      text: '  <quoted messageId="quoted-message"/> response  ',
      entities: [
        { type: 'quotedReply', quotedReply: { messageId: 'quoted-message' } },
        { type: 'custom', value: true }
      ]
    })

    await teamsContext.sendActivity(response)

    assert.strictEqual(response.text, '  <quoted messageId="quoted-message"/> response  ')
    assert.strictEqual(response.entities?.some(entity => entity.type === 'quotedReply'), true)
    assert.strictEqual(sentActivities[0].text, 'response')
    assert.deepStrictEqual(sentActivities[0].entities, [
      { type: 'custom', value: true },
      { type: 'targetedMessageInfo', messageId: 'inbound-message' }
    ])
  })

  it('should add prompt-preview metadata to each outgoing message without duplication', async () => {
    const sentActivities: Activity[] = []
    const context = createContext()
    context.activity.id = 'inbound-message'
    context.activity.recipient = { id: 'bot', isTargeted: true }
    context.adapter.sendActivities = async (_context: TurnContext, activities: Activity[]) => {
      sentActivities.push(...activities)
      return activities.map((_activity, index) => ({ id: `sent-${index}` }))
    }
    const teamsContext = new TeamsTurnContext(context)

    await teamsContext.sendActivities([
      Activity.fromObject({ type: 'message', text: 'first' }),
      Activity.fromObject({ type: 'message', text: 'second', entities: [{ type: 'targetedMessageInfo', messageId: 'existing' }] }),
      Activity.fromObject({ type: 'event', name: 'unchanged' })
    ])

    assert.deepStrictEqual(sentActivities[0].entities, [{ type: 'targetedMessageInfo', messageId: 'inbound-message' }])
    assert.deepStrictEqual(sentActivities[1].entities, [{ type: 'targetedMessageInfo', messageId: 'existing' }])
    assert.strictEqual(sentActivities[2].entities, undefined)
  })

  it('should create a delegated Graph client using authorization from turn state', async () => {
    const context = createContext()
    let requestedContext: TurnContext | undefined
    let requestedHandlerName: string | undefined
    const authorization = {
      manager: { handlers: [{ id: 'defaultGraph' }] },
      async getToken (turnContext: TurnContext, handlerName: string) {
        requestedContext = turnContext
        requestedHandlerName = handlerName
        return { token: 'user-token' }
      }
    } as unknown as Authorization
    context.turnState.set(AgentApplication.UserAuthorizationKey, authorization)
    const teamsContext = new TeamsTurnContext(context)

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsContext.getGraphClient()
      const graphOptions = getOptions()

      assert.strictEqual(client, expectedClient)
      assert.ok(graphOptions?.authProvider)
      assert.strictEqual(await graphOptions.authProvider.getAccessToken(), 'user-token')
      assert.strictEqual(requestedContext, teamsContext)
      assert.strictEqual(requestedHandlerName, 'defaultGraph')
    })
  })

  it('should create an app-only Graph client using the current turn connection', async () => {
    const context = createContext()
    let requestedIdentity: unknown
    let requestedActivity: Activity | undefined
    let requestedScope: string | undefined
    const tokenProvider = {
      async getAccessToken (scope: string) {
        requestedScope = scope
        return 'app-token'
      }
    } as AuthProvider
    const connections = {
      getTokenProviderFromActivity (identity, activity) {
        requestedIdentity = identity
        requestedActivity = activity
        return tokenProvider
      }
    } as Connections
    context.turnState.set(AgentApplication.ConnectionsKey, connections)
    const teamsContext = new TeamsTurnContext(context)

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsContext.getAppGraphClient()
      const graphOptions = getOptions()

      assert.strictEqual(client, expectedClient)
      assert.ok(graphOptions?.authProvider)
      assert.strictEqual(await graphOptions.authProvider.getAccessToken(), 'app-token')
      assert.deepStrictEqual(requestedIdentity, { aud: 'api://agent' })
      assert.strictEqual(requestedActivity, context.activity)
      assert.strictEqual(requestedScope, 'https://graph.microsoft.com/.default')
    })
  })

  it('should create an app-only Graph client using a named turn connection', async () => {
    const context = createContext()
    let requestedConnectionName: string | undefined
    let requestedScope: string | undefined
    const tokenProvider = {
      async getAccessToken (scope: string) {
        requestedScope = scope
        return 'app-token'
      }
    } as AuthProvider
    const connections = {
      getConnection (connectionName) {
        requestedConnectionName = connectionName
        return tokenProvider
      }
    } as Connections
    context.turnState.set(AgentApplication.ConnectionsKey, connections)
    const teamsContext = new TeamsTurnContext(context)

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsContext.getAppGraphClientForConnection('graph-app', 'https://graph.microsoft.us/v1.0')
      const graphOptions = getOptions()

      assert.strictEqual(client, expectedClient)
      assert.ok(graphOptions?.authProvider)
      assert.strictEqual(await graphOptions.authProvider.getAccessToken(), 'app-token')
      assert.strictEqual(requestedConnectionName, 'graph-app')
      assert.strictEqual(requestedScope, 'https://graph.microsoft.us/.default')
    })
  })

  it('should throw clear errors when Graph client services are unavailable', () => {
    const teamsContext = new TeamsTurnContext(createContext())

    assert.throws(() => teamsContext.getGraphClient(), /User authorization is not configured/)
    assert.throws(() => teamsContext.getAppGraphClient(), /Connections are not configured/)
    assert.throws(() => teamsContext.getAppGraphClientForConnection(''), /connectionName parameter is required/)
  })

  it('should be assignable to the public TeamsTurnContext type', () => {
    const context = createContext()
    setTeamsApiClient(context)

    const teamsContext: TeamsTurnContext = new TeamsTurnContext(context)

    assert.strictEqual(typeof teamsContext.sendTargetedActivity, 'function')
  })
})
