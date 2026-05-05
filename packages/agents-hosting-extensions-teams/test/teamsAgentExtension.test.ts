import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, TurnContext } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import { TeamsApiClientKey } from '../src/teamsApiClient'

function createContext (channelId: string = 'msteams'): TurnContext {
  const adapter = {
    ConnectorClientKey: Symbol('ConnectorClient')
  } as any

  const context = new TurnContext(
    adapter,
    Activity.fromObject({
      type: ActivityTypes.Message,
      channelId,
      serviceUrl: 'https://service.example.com',
      conversation: { id: 'conversation-id' },
      recipient: { id: 'bot' },
      from: { id: 'user' },
      text: 'hello'
    })
  )

  context.turnState.set(adapter.ConnectorClientKey, {
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

  return context
}

describe('TeamsAgentExtension', () => {
  it('sets the Teams client in turnState during beforeTurn for Teams activities', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext()
    const handled = await app.runInternal(context)

    assert.strictEqual(handled, true)
    assert.ok(context.turnState.has(TeamsApiClientKey))
    assert.strictEqual(TeamsAgentExtension.getTeamsClient(context).serviceUrl, 'https://service.example.com')
  })

  it('does not set the Teams client during beforeTurn for non-Teams activities', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext('emulator')
    const handled = await app.runInternal(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(context.turnState.has(TeamsApiClientKey), false)
  })

  it('does not overwrite an existing Teams client in turnState', async () => {
    const app = new AgentApplication()
    const extension = new TeamsAgentExtension(app)

    app.registerExtension(extension, () => {})
    app.onActivity(ActivityTypes.Message, async () => {})

    const context = createContext()
    const existingClient = { serviceUrl: 'https://existing.example.com' }
    context.turnState.set(TeamsApiClientKey, existingClient)

    const handled = await app.runInternal(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(context.turnState.get(TeamsApiClientKey), existingClient)
  })
})
