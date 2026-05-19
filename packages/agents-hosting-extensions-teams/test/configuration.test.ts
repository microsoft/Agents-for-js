import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import type { ConfigResponse } from '@microsoft/teams.api'

function addConnectorClientToTurnState (context: TurnContext): void {
  context.turnState.set(context.adapter.ConnectorClientKey, {
    axiosInstance: {
      defaults: {
        baseURL: 'https://service.example.com',
        headers: { common: { Authorization: 'Bearer token' } }
      }
    }
  })
}

describe('Configuration', () => {
  const adapter = new CloudAdapter()

  it('onConfigFetch fires and sends InvokeResponse with body', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.configuration.onConfigFetch(async (_ctx: TurnContext, _state: TurnState, configData: unknown): Promise<ConfigResponse> => {
        handled = true
        assert.deepStrictEqual(configData, { settingsKey: 'value' })
        return { responseType: 'config', config: { type: 'continue', value: { title: 'Config' } } } as ConfigResponse
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'config/fetch',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { settingsKey: 'value' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const invokeValue = invokeResp.value as any
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.responseType, 'config')
    assert.strictEqual(invokeValue.body.config.type, 'continue')
  })

  it('onConfigSubmit fires and sends InvokeResponse with body', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.configuration.onConfigSubmit(async (): Promise<ConfigResponse> => {
        handled = true
        return { responseType: 'config', config: { type: 'continue', value: { title: 'Saved' } } } as ConfigResponse
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'config/submit',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: {}
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    assert.strictEqual((invokeResp.value as any).status, 200)
  })

  it('onConfigFetch does not fire for config/submit', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.configuration.onConfigFetch(async (): Promise<ConfigResponse> => {
        handled = true
        return { responseType: 'config', config: { type: 'continue' } } as ConfigResponse
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'config/submit',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: {}
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('configuration handlers do not fire for non-msteams channel', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.configuration.onConfigFetch(async (): Promise<ConfigResponse> => {
        handled = true
        return { responseType: 'config', config: { type: 'continue' } } as ConfigResponse
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'emulator',
      name: 'config/fetch',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: {}
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
