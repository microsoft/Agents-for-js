import assert from 'assert'
import { describe, it } from 'node:test'
import { AgentApplication, TurnContext, TurnState, INVOKE_RESPONSE_KEY, CloudAdapter } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import { MessagingExtensionResponse } from '../src/messageExtension/messagingExtensionResponse'

interface InvokeValue {
  status: number
  body?: any
}

describe('MessageExtension', function () {
  const app = new AgentApplication()
  const adapter = new CloudAdapter()
  const activity = Activity.fromObject({
    type: ActivityTypes.Invoke,
    channelId: 'msteams',
    from: { id: 'user', name: 'User' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' }
  })

  it('onConfigurationQuerySettingUrl sets an InvokeResponse with status and body when handler returns a response', async function () {
    let handled = false
    const teamsExt = new TeamsAgentExtension(app)

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.messageExtension.onConfigurationQuerySettingUrl(async (_context: TurnContext, _state: TurnState, _settings: unknown): Promise<MessagingExtensionResponse> => {
        handled = true
        return {
          composeExtension: {
            type: 'result',
            text: 'url configured'
          }
        }
      })
    })

    activity.name = 'composeExtension/querySettingUrl'
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.composeExtension.type, 'result')
    assert.strictEqual(invokeValue.body.composeExtension.text, 'url configured')
  })

  it('onConfigurationSetting sets an InvokeResponse with status 200 when handler returns a response', async function () {
    const teamsExt = new TeamsAgentExtension(app)
    let handled = false

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.messageExtension.onConfigurationSetting(async (_context: TurnContext, _state: TurnState, _settings: unknown): Promise<void> => {
        handled = true
      })
    })

    activity.name = 'composeExtension/setting'
    const context = new TurnContext(adapter, activity)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
  })
})
