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

describe('Message', () => {
  const adapter = new CloudAdapter()

  it('onMessageEdit fires for editMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageEdit(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageUpdate,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'editMessage' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onMessageDelete fires for softDeleteMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageDelete(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageDelete,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'softDeleteMessage' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onMessageUndelete fires for undeleteMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageUndelete(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageUpdate,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'undeleteMessage' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('onReadReceipt fires for readReceipt event', async () => {
    let handled = false
    let receivedData: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onReadReceipt(async (_ctx, _state, data) => {
        handled = true
        receivedData = data
      })
    })

    const receiptValue = { lastReadMessageId: '42' }
    const activity = Activity.fromObject({
      type: ActivityTypes.Event,
      channelId: 'msteams',
      name: 'application/vnd.microsoft.readReceipt',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: receiptValue
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedData, receiptValue)
  })

  it('onO365ConnectorCardAction fires and sends InvokeResponse', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onO365ConnectorCardAction(async (_ctx, _state, query) => {
        handled = true
        assert.strictEqual(query.actionId, 'action-1')
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'actionableMessage/executeAction',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      value: { actionId: 'action-1' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    assert.strictEqual((invokeResp.value as any).status, 200)
  })

  it('message handlers do not fire for non-msteams channel', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageEdit(async () => { handled = true })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageUpdate,
      channelId: 'emulator',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'editMessage' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
