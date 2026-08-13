import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'

function addConnectorClientToTurnState (context: TurnContext): void {
  context.turnState.set(context.adapter.ConnectorClientKey, {
    httpClient: {
      baseURL: 'https://service.example.com',
      defaultHeaders: {
        Authorization: 'Bearer token'
      }
    }
  })
}

describe('FileConsent', () => {
  const adapter = new CloudAdapter()

  it('should fire onAccept and send an InvokeResponse when file consent is accepted', async () => {
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
      name: 'FILECONSENT/INVOKE',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'ACCEPT', context: { filename: 'test.txt' }, uploadInfo: { uploadUrl: 'https://example.com' } }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.strictEqual((receivedResponse as any).action, 'ACCEPT')

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should fire onDecline and send an InvokeResponse when file consent is declined', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.fileConsent.onDecline(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'FILECONSENT/INVOKE',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { action: 'DECLINE' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should not fire onAccept when file consent is declined', async () => {
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

  it('should not fire file consent handlers when the channel is not msteams', async () => {
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
