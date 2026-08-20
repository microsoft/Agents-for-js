import assert from 'assert'
import { beforeEach, describe, it } from 'node:test'
import { AgentApplication, TurnContext, TurnState, INVOKE_RESPONSE_KEY, CloudAdapter } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'
import { TeamsAgentExtension } from '../src/teamsAgentExtension'
import type { AppBasedLinkQuery, MessagingExtensionActionResponse, MessagingExtensionQuery, MessagingExtensionResponse, TaskModuleResponse } from '@microsoft/teams.api'

interface InvokeValue {
  status: number
  body?: any
}

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

function createInvokeActivity (name: string, value?: unknown): Activity {
  return Activity.fromObject({
    type: ActivityTypes.Invoke,
    channelId: 'msteams',
    name,
    from: { id: 'user', name: 'User' },
    conversation: { id: 'conv' },
    recipient: { id: 'bot' },
    value: value ?? {}
  })
}

describe('MessageExtension', function () {
  let app: AgentApplication<TurnState>
  let adapter: CloudAdapter
  let activity: Activity

  beforeEach(function () {
    app = new AgentApplication()
    adapter = new CloudAdapter()
    activity = Activity.fromObject({
      type: ActivityTypes.Invoke,
      channelId: 'msteams',
      from: { id: 'user', name: 'User' },
      conversation: { id: 'conv' },
      recipient: { id: 'bot' }
    })
  })

  it('should set an InvokeResponse with status and body when onQuerySettingUrl returns a response', async function () {
    let handled = false
    const teamsExt = new TeamsAgentExtension(app)

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.messageExtensions.onQuerySettingUrl(async (_context: TurnContext, _state: TurnState): Promise<MessagingExtensionResponse> => {
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
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.composeExtension.type, 'result')
    assert.strictEqual(invokeValue.body.composeExtension.text, 'url configured')
  })

  it('should set an InvokeResponse with status 200 when onSetting returns a response', async function () {
    const teamsExt = new TeamsAgentExtension(app)
    let handled = false

    app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
      tae.messageExtensions.onSetting(async (_context: TurnContext, _state: TurnState, _settings: MessagingExtensionQuery): Promise<MessagingExtensionResponse> => {
        handled = true
        return {
          composeExtension: {
            type: 'result',
            text: 'settings configured'
          }
        }
      })
    })

    activity.name = 'composeExtension/setting'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)

    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp, 'invoke response should be set in turnState')

    const invokeValue = invokeResp.value as InvokeValue
    assert.strictEqual(invokeValue.status, 200)
  })

  it('should fire onQuery when composeExtension/query has a matching commandId string', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onQuery('searchCmd', async (_ctx, _state, query): Promise<MessagingExtensionResponse> => {
        handled = true
        assert.strictEqual(query.commandId, 'searchCmd')
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/query', {
      commandId: 'searchCmd',
      parameters: [{ name: 'query', value: 'test' }]
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const invokeValue = invokeResp.value as any
    assert.strictEqual(invokeValue.status, 200)
    assert.strictEqual(invokeValue.body.composeExtension.type, 'result')
  })

  it('should fire onQuery when composeExtension/query has a matching commandId regex', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onQuery(/search.*/, async (): Promise<MessagingExtensionResponse> => {
        handled = true
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/query', {
      commandId: 'searchUsers',
      parameters: []
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
  })

  it('should not fire onQuery when commandId does not match', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onQuery('searchCmd', async (): Promise<MessagingExtensionResponse> => {
        handled = true
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/query', {
      commandId: 'otherCmd',
      parameters: []
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })

  it('should fire onSelectItem when receiving composeExtension/selectItem', async () => {
    let handled = false
    let receivedItem: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onSelectItem(async (_ctx, _state, item): Promise<MessagingExtensionResponse> => {
        handled = true
        receivedItem = item
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const itemValue = { id: 'item-1', title: 'Selected' }
    const activity = createInvokeActivity('composeExtension/selectItem', itemValue)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedItem, itemValue)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should fire onQueryLink when composeExtension/queryLink has a valid URL', async () => {
    let handled = false
    let receivedQuery: AppBasedLinkQuery | undefined
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onQueryLink(async (_ctx, _state, query): Promise<MessagingExtensionResponse> => {
        handled = true
        receivedQuery = query
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/queryLink', { url: 'https://example.com/page', state: 'magic-code' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedQuery, { url: 'https://example.com/page', state: 'magic-code' })
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should fire onAnonymousQueryLink when receiving composeExtension/anonymousQueryLink', async () => {
    let handled = false
    let receivedQuery: AppBasedLinkQuery | undefined
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onAnonymousQueryLink(async (_ctx, _state, query): Promise<MessagingExtensionResponse> => {
        handled = true
        receivedQuery = query
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/anonymousQueryLink', { url: 'https://example.com/anon' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedQuery, { url: 'https://example.com/anon' })
  })

  it('should fire onFetchAction when composeExtension/fetchTask has a matching commandId', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onFetchAction('createCard', async (): Promise<TaskModuleResponse> => {
        handled = true
        return { task: { type: 'message', value: 'fetched' } }
      })
    })

    const activity = createInvokeActivity('composeExtension/fetchTask', { commandId: 'createCard' })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
    const value = (invokeResp.value as any).body.task.value
    assert.strictEqual(value, 'fetched')
  })

  it('should fire onSubmitAction when composeExtension/submitAction has a matching commandId', async () => {
    let handled = false
    let receivedData: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onSubmitAction('createCard', async (_ctx, _state, data): Promise<MessagingExtensionActionResponse> => {
        handled = true
        receivedData = data
        return { composeExtension: { type: 'result', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/submitAction', {
      commandId: 'createCard',
      data: { title: 'My Card' }
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.strictEqual((receivedData as any).commandId, 'createCard')
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should fire onSubmitAction when botMessagePreviewAction is set', async () => {
    let handled = false
    let receivedPreviewAction: string | undefined
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onSubmitAction('createCard', async (_ctx, _state, action): Promise<MessagingExtensionActionResponse> => {
        handled = true
        receivedPreviewAction = action.botMessagePreviewAction
        return { composeExtension: { type: 'result', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/submitAction', {
      commandId: 'createCard',
      botMessagePreviewAction: 'edit'
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
    assert.strictEqual(receivedPreviewAction, 'edit')
  })

  it('should fire onMessagePreviewEdit when submitAction has botMessagePreviewAction=edit', async () => {
    let handled = false
    let receivedActivity: Activity | undefined
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onMessagePreviewEdit('createCard', async (_ctx, _state, previewActivity): Promise<MessagingExtensionActionResponse> => {
        handled = true
        receivedActivity = previewActivity
        return { composeExtension: { type: 'result', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/submitAction', {
      commandId: 'createCard',
      botMessagePreviewAction: 'edit',
      botActivityPreview: [{ type: ActivityTypes.Message, text: 'Edit preview' }]
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(receivedActivity!.text, 'Edit preview')
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should fire onMessagePreviewSend when submitAction has botMessagePreviewAction=send', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onMessagePreviewSend('createCard', async (_ctx, _state, previewActivity) => {
        handled = true
        assert.ok(previewActivity)
      })
    })

    const activity = createInvokeActivity('composeExtension/submitAction', {
      commandId: 'createCard',
      botMessagePreviewAction: 'send',
      botActivityPreview: [{ type: ActivityTypes.Message, text: 'Preview text' }]
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, true)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
    const body = (invokeResp.value as any).body
    assert.deepStrictEqual(body, {})
  })

  it('should pass undefined to onMessagePreviewSend when botActivityPreview is empty', async () => {
    let handled = false
    let receivedActivity: Activity | undefined
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onMessagePreviewSend('createCard', async (_ctx, _state, previewActivity) => {
        handled = true
        receivedActivity = previewActivity
      })
    })

    const activity = createInvokeActivity('composeExtension/submitAction', {
      commandId: 'createCard',
      botMessagePreviewAction: 'send',
      botActivityPreview: []
    })
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.strictEqual(receivedActivity, undefined)
  })

  it('should fire onCardButtonClicked and send an InvokeResponse when a card button is clicked', async () => {
    let handled = false
    let receivedData: unknown
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onCardButtonClicked(async (_ctx, _state, cardData) => {
        handled = true
        receivedData = cardData
      })
    })

    const cardValue = { buttonId: 'btn-1', action: 'click' }
    const activity = createInvokeActivity('composeExtension/onCardButtonClicked', cardValue)
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)

    assert.strictEqual(handled, true)
    assert.deepStrictEqual(receivedData, cardValue)
    const invokeResp = context.turnState.get(INVOKE_RESPONSE_KEY) as Activity | undefined
    assert.ok(invokeResp)
    const status = (invokeResp.value as any).status
    assert.strictEqual(status, 200)
  })

  it('should not fire message extension handlers when the channel is not msteams', async () => {
    let handled = false
    const app = new AgentApplication()
    const teamsExt = new TeamsAgentExtension(app)
    app.registerExtension(teamsExt, (tae) => {
      tae.messageExtensions.onSelectItem(async (): Promise<MessagingExtensionResponse> => {
        handled = true
        return { composeExtension: { type: 'result', attachmentLayout: 'list', attachments: [] } }
      })
    })

    const activity = createInvokeActivity('composeExtension/selectItem', {})
    activity.channelId = 'emulator'
    const context = new TurnContext(adapter, activity)
    addConnectorClientToTurnState(context)
    await app.run(context)
    assert.strictEqual(handled, false)
  })
})
