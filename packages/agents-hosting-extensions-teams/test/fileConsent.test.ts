import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'

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

describe('FileConsent', () => {
  const adapter = new CloudAdapter()

  it('onAccept fires for file consent accept and sends InvokeResponse', async () => {
    let handled = false
    let receivedResponse: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.fileConsent.onAccept(async (_ctx, _state, response) => {
        handled = true
        receivedResponse = response
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'fileConsent/invoke',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'accept', context: { filename: 'test.txt' }, uploadInfo: { uploadUrl: 'https://example.com' } }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.strictEqual((receivedResponse as any).action, 'accept')

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    assert.strictEqual((invokeResp.value as any).status, 200)
  })

  it('onDecline fires for file consent decline and sends InvokeResponse', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.fileConsent.onDecline(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'fileConsent/invoke',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'decline' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    assert.strictEqual((invokeResp.value as any).status, 200)
  })

  it('onAccept does not fire for decline action', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.fileConsent.onAccept(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'fileConsent/invoke',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'decline' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('file consent handlers do not fire for non-msteams channel', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.fileConsent.onAccept(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'emulator',
      name: 'fileConsent/invoke',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'accept' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
