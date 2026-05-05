import assert from 'node:assert'
import { describe, it } from 'node:test'
import { TurnContext } from '@microsoft/agents-hosting'
import { Activity } from '@microsoft/agents-activity'
import { getTeamsClient, setTeamsApiClient, TeamsApiClientKey } from '../src/teamsApiClient'
import { SetTeamsApiClientMiddleware } from '../src/compat/setTeamsApiClientMiddleware'

function createContext (channelId: string = 'msteams', withConnectorClient: boolean = true, serviceUrl: string = 'https://service.example.com'): TurnContext {
  const context = new TurnContext(
    {
      ConnectorClientKey: Symbol('ConnectorClient')
    } as any,
    Activity.fromObject({
      type: 'message',
      channelId,
      serviceUrl
    })
  )

  if (withConnectorClient) {
    context.turnState.set(context.adapter.ConnectorClientKey, {
      axiosInstance: {
        defaults: {
          baseURL: 'https://service.example.com',
          headers: {
            common: {
              Authorization: 'Bearer token',
              'User-Agent': 'test-agent',
              'X-Trace': 123
            }
          }
        }
      }
    })
  }

  return context
}

describe('teamsApiClient', () => {
  it('sets teams client in turn state for Teams activities', () => {
    const context = createContext()

    setTeamsApiClient(context)

    assert.ok(context.turnState.has(TeamsApiClientKey))
    assert.strictEqual(getTeamsClient(context).serviceUrl, 'https://service.example.com')
  })

  it('does not set teams client for non-Teams activities', () => {
    const context = createContext('emulator')

    setTeamsApiClient(context)

    assert.strictEqual(context.turnState.has(TeamsApiClientKey), false)
  })

  it('middleware populates the teams client before continuing', async () => {
    const context = createContext()
    const middleware = new SetTeamsApiClientMiddleware()
    let nextCalled = false

    await middleware.onTurn(context, async () => {
      nextCalled = true
      assert.ok(context.turnState.has(TeamsApiClientKey))
    })

    assert.strictEqual(nextCalled, true)
  })

  it('throws a setup error when running on Teams channel without ConnectorClient', () => {
    const context = createContext('msteams', false)

    assert.throws(() => {
      setTeamsApiClient(context)
    }, /Teams API client setup failed: missing ConnectorClient in turnState/)
  })

  it('throws a setup error when serviceUrl and connector baseURL are both missing', () => {
    const context = createContext('msteams', true)
    context.activity.serviceUrl = undefined
    const connectorClient = context.turnState.get<any>(context.adapter.ConnectorClientKey)
    connectorClient.axiosInstance.defaults.baseURL = ''

    assert.throws(() => {
      setTeamsApiClient(context)
    }, /Teams API client setup failed: missing activity.serviceUrl and ConnectorClient baseURL/)
  })
})
