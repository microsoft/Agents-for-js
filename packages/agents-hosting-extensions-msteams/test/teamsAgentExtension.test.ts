import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, type AuthProvider, type Connections, HeaderPropagation, TurnContext } from '@microsoft/agents-hosting'
import { Client as GraphClient, type ClientOptions } from '@microsoft/microsoft-graph-client'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import { TEAMS_USER_AGENT_PRODUCT } from '../src/teamsHeaderPropagation'
import { TeamsTurnContext } from '../src/teamsTurnContext'

function createContext (channelId: string = 'msteams', type: string = ActivityTypes.Message): TurnContext {
  const adapter = {
    ConnectorClientKey: Symbol('ConnectorClient'),
    async sendActivities (_context: TurnContext, activities: Activity[]) {
      return activities.map((_activity, index) => ({ id: `activity-${index}` }))
    }
  } as any

  const context = new TurnContext(
    adapter,
    Activity.fromObject({
      type,
      channelId,
      serviceUrl: 'https://service.example.com',
      conversation: { id: 'conversation-id' },
      recipient: { id: 'bot' },
      from: { id: 'user' },
      channelData: { eventType: 'editMessage' },
      text: 'hello'
    }),
    { aud: 'api://agent' }
  )

  context.turnState.set(adapter.ConnectorClientKey, {
    httpClient: {
      baseURL: 'https://service.example.com',
      defaultHeaders: {
        Authorization: 'Bearer token',
        'User-Agent': 'test-agent'
      }
    }
  })

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

describe('TeamsAgentExtension', () => {
  it('should create a Teams turn context during Teams turns', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext()
    const handled = await app.runInternal(context)
    const teamsContext = new TeamsTurnContext(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(teamsContext.client.serviceUrl, 'https://service.example.com')
  })

  it('should not create a Teams turn context for non-Teams activities', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext('emulator')
    const handled = await app.runInternal(context)

    assert.strictEqual(handled, true)
    assert.throws(() => new TeamsTurnContext(context).client, /Teams API client is not available/)
  })

  it('should get the Teams client for a Teams turn', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext()
    const handled = await app.runInternal(context)
    const teamsClient = extension.getTeamsClient(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(teamsClient.serviceUrl, 'https://service.example.com')
  })

  it('should throw when getting the Teams client before it is available', () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)
    const context = createContext('emulator')

    assert.throws(() => extension.getTeamsClient(context), /Teams API client is not available/)
  })

  it('should pass TeamsTurnContext to Teams channel handlers', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)
    let handlerContext: TeamsTurnContext | undefined

    app.registerExtension(extension, (teams) => {
      teams.channels.onCreated(async (context) => {
        handlerContext = context
      })
    })

    const context = createContext('msteams', ActivityTypes.ConversationUpdate)
    context.activity.channelData = {
      eventType: 'channelCreated',
      channel: { id: 'channel-id' }
    }
    const handled = await app.runInternal(context)

    assert.strictEqual(handled, true)
    assert.ok(handlerContext)
    assert.strictEqual(handlerContext.client.serviceUrl, 'https://service.example.com')
    assert.strictEqual(typeof handlerContext.sendTargetedActivity, 'function')
    assert.strictEqual(typeof handlerContext.sendTargetedActivities, 'function')
  })

  it('should configure header propagation with the Teams user-agent product token', () => {
    const headers = new HeaderPropagation({})
    const app = new AgentApplication()
    let extensionRegistered = false

    const teamsExt = new TeamsAgentExtension(app)

    app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
      extensionRegistered = true
    })

    // Invoke callback. This is done inside adapter.process()
    app.options.headerPropagation?.(headers)

    assert.strictEqual(extensionRegistered, true)
    assert.strictEqual(headers.outgoing['User-Agent'], TEAMS_USER_AGENT_PRODUCT)
  })

  it('should append the Teams user-agent product token to an incoming user-agent', () => {
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    let extensionRegistered = false

    const headers = new HeaderPropagation({ 'user-agent': 'incoming-agent/1.0' })

    app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
      extensionRegistered = true
    })

    // Invoke callback. This is done inside adapter.process()
    app.options.headerPropagation?.(headers)

    assert.strictEqual(extensionRegistered, true)
    assert.match(headers.outgoing['user-agent'], /incoming-agent\/1\.0/)
    assert.match(headers.outgoing['user-agent'], new RegExp(escapeRegExp(TEAMS_USER_AGENT_PRODUCT)))
  })

  it('should compose with existing app header propagation before appending the Teams user-agent product token', () => {
    let extensionRegistered = false
    const app = new AgentApplication({
      headerPropagation: (headers) => {
        headers.add({ 'x-custom-header': 'custom-value' })
        headers.add({ 'User-Agent': 'custom-agent/1.0' })
      }
    })
    const teamsExt = new TeamsAgentExtension(app)

    const headers = new HeaderPropagation({})

    app.registerExtension<TeamsAgentExtension>(teamsExt, tae => {
      extensionRegistered = true
    })

    // Invoke callback. This is done inside adapter.process()
    app.options.headerPropagation?.(headers)

    assert.strictEqual(extensionRegistered, true)
    assert.strictEqual(headers.outgoing['x-custom-header'], 'custom-value')
    assert.match(headers.outgoing['User-Agent'], /custom-agent\/1\.0/)
    assert.match(headers.outgoing['User-Agent'], new RegExp(escapeRegExp(TEAMS_USER_AGENT_PRODUCT)))
  })

  it('should copy the propagated Teams user-agent product token to the Teams API client', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const headers = new HeaderPropagation({})
    app.options.headerPropagation?.(headers)

    const context = createContext()
    const connectorClient = context.turnState.get<any>(context.adapter.ConnectorClientKey)
    connectorClient.httpClient.defaultHeaders = {
      ...connectorClient.httpClient.defaultHeaders,
      ...headers.outgoing
    }

    await app.runInternal(context)
    const teamsContext = new TeamsTurnContext(context)

    const userAgentHeader = (teamsContext.client as any).http.options.headers['User-Agent']
    assert.strictEqual(userAgentHeader, TEAMS_USER_AGENT_PRODUCT)
  })

  it('should create a Graph client that uses the configured authorization handler', async () => {
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    const context = createContext()
    let requestedContext: TurnContext | undefined
    let requestedHandlerName: string | undefined

    Object.defineProperty(app, 'authorization', {
      configurable: true,
      value: {
        async getToken (turnContext: TurnContext, handlerName: string) {
          requestedContext = turnContext
          requestedHandlerName = handlerName
          return { token: 'graph-token' }
        }
      }
    })

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsExt.getGraphClient(context, 'graph', 'https://graph.example.com/v1.0')
      const graphOptions = getOptions()
      const authProvider = graphOptions?.authProvider

      assert.strictEqual(client, expectedClient)
      assert.strictEqual(graphOptions?.baseUrl, 'https://graph.example.com/v1.0')
      assert.strictEqual(graphOptions?.defaultVersion, '')
      assert.deepStrictEqual(graphOptions?.customHosts, new Set(['graph.example.com']))
      assert.ok(authProvider)
      assert.strictEqual(await authProvider.getAccessToken(), 'graph-token')
      assert.strictEqual(requestedContext, context)
      assert.strictEqual(requestedHandlerName, 'graph')
    })
  })

  it('should create a Graph client with the default authorization handler and Graph base URL', async () => {
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    const context = createContext()
    let requestedContext: TurnContext | undefined
    let requestedHandlerName: string | undefined

    Object.defineProperty(app, 'authorization', {
      configurable: true,
      value: {
        manager: {
          handlers: [{ id: 'defaultGraph' }]
        },
        async getToken (turnContext: TurnContext, handlerName: string) {
          requestedContext = turnContext
          requestedHandlerName = handlerName
          return { token: 'default-token' }
        }
      }
    })

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsExt.getGraphClient(context)
      const graphOptions = getOptions()
      const authProvider = graphOptions?.authProvider

      assert.strictEqual(client, expectedClient)
      assert.strictEqual(graphOptions?.baseUrl, 'https://graph.microsoft.com/v1.0')
      assert.strictEqual(graphOptions?.defaultVersion, '')
      assert.deepStrictEqual(graphOptions?.customHosts, new Set(['graph.microsoft.com']))
      assert.ok(authProvider)
      assert.strictEqual(await authProvider.getAccessToken(), 'default-token')
      assert.strictEqual(requestedContext, context)
      assert.strictEqual(requestedHandlerName, 'defaultGraph')
    })
  })

  it('should create an app-only Graph client using the connection resolved for the current turn', async () => {
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
    const teamsExt = new TeamsAgentExtension(new AgentApplication({ connections }))

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsExt.getAppGraphClient(context)
      const graphOptions = getOptions()

      assert.strictEqual(client, expectedClient)
      assert.strictEqual(graphOptions?.baseUrl, 'https://graph.microsoft.com/v1.0')
      assert.ok(graphOptions?.authProvider)
      assert.strictEqual(await graphOptions.authProvider.getAccessToken(), 'app-token')
      assert.deepStrictEqual(requestedIdentity, { aud: 'api://agent' })
      assert.strictEqual(requestedActivity, context.activity)
      assert.strictEqual(requestedScope, 'https://graph.microsoft.com/.default')
    })
  })

  it('should create an app-only Graph client using a named connection and national cloud scope', async () => {
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
    const teamsExt = new TeamsAgentExtension(new AgentApplication({ connections }))

    await withCapturedGraphClientOptions(async (getOptions, expectedClient) => {
      const client = teamsExt.getAppGraphClientForConnection('graph-app', 'https://graph.microsoft.us/v1.0')
      const graphOptions = getOptions()

      assert.strictEqual(client, expectedClient)
      assert.strictEqual(graphOptions?.baseUrl, 'https://graph.microsoft.us/v1.0')
      assert.deepStrictEqual(graphOptions?.customHosts, new Set(['graph.microsoft.us']))
      assert.ok(graphOptions?.authProvider)
      assert.strictEqual(await graphOptions.authProvider.getAccessToken(), 'app-token')
      assert.strictEqual(requestedConnectionName, 'graph-app')
      assert.strictEqual(requestedScope, 'https://graph.microsoft.us/.default')
    })
  })

  it('should reject an empty app-only Graph connection name', () => {
    const teamsExt = new TeamsAgentExtension(new AgentApplication())

    assert.throws(() => teamsExt.getAppGraphClientForConnection(''), /connectionName parameter is required/)
  })

  it('should validate required turn contexts before creating Graph clients', () => {
    const teamsExt = new TeamsAgentExtension(new AgentApplication())

    assert.throws(
      () => teamsExt.getGraphClient(undefined as unknown as TurnContext),
      /context parameter is required/
    )
    assert.throws(
      () => teamsExt.getAppGraphClient(undefined as unknown as TurnContext),
      /context parameter is required/
    )
  })
})

function escapeRegExp (value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
