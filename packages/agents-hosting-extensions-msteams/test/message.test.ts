import assert from 'node:assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CloudAdapter, INVOKE_RESPONSE_KEY, TurnContext } from '@microsoft/agents-hosting'
import type { ReadReceiptInfo } from '../src/models/readReceiptInfo'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import { TeamsTurnContext } from '../src/teamsTurnContext'

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

describe('Message', () => {
  const adapter = new CloudAdapter()

  it('should fire onMessageEdit with TeamsTurnContext when receiving an editMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageEdit(async (context) => {
        handled = true
        assert.ok(context instanceof TeamsTurnContext)
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageUpdate,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'EDITMESSAGE' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onMessageDelete when receiving a softDeleteMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageDelete(async (context) => {
        handled = true
        assert.ok(context instanceof TeamsTurnContext)
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageDelete,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'SOFTDELETEMESSAGE' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onMessageUndelete when receiving an undeleteMessage event', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onMessageUndelete(async (context) => {
        handled = true
        assert.ok(context instanceof TeamsTurnContext)
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.MessageUpdate,
      channelId: 'msteams',
      from: { id: 'user' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' },
      channelData: { eventType: 'UNDELETEMESSAGE' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should fire onReadReceipt when receiving a readReceipt event', async () => {
    let handled = false
    let receivedData: ReadReceiptInfo | undefined
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
      name: 'APPLICATION/VND.MICROSOFT.READRECEIPT',
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
    assert.strictEqual(receivedData?.lastReadMessageId, '42')
  })

  it('should fire onExecuteAction and send an InvokeResponse when receiving an executeAction invoke', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messages.onExecuteAction(async (_ctx, _state, query) => {
        handled = true
        assert.strictEqual(query.actionId, 'action-1')
      })
    })

    const activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      name: 'ACTIONABLEMESSAGE/EXECUTEACTION',
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
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should not fire message handlers when the channel is not msteams', async () => {
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
