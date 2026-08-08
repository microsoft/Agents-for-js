import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { AgentApplication } from '../../../src/app/agentApplication'
import { AdaptiveCardActionExecuteResponseType } from '../../../src/app/adaptiveCards/adaptiveCardActionExecuteResponseType'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'

class RecordingAdapter extends TestAdapter {
  public readonly sent: Activity[] = []
  public readonly updated: Activity[] = []

  setAgentName (_name?: string): void {}
  connectionManager = undefined

  override async sendActivities (context: TurnContext, activities: Activity[]) {
    this.sent.push(...activities.map(Activity.fromObject))
    return await super.sendActivities(context, activities)
  }

  override async updateActivity (_context: TurnContext, activity: Activity) {
    this.updated.push(Activity.fromObject(activity))
    return { id: activity.id ?? '' }
  }
}

const card = () => ({
  type: 'AdaptiveCard' as const,
  version: '1.5',
  body: [],
  refresh: { action: { type: 'Action.Execute', verb: 'refresh' }, userIds: ['29:user'] }
})

const invoke = (trigger: 'automatic' | 'manual') => Activity.fromObject({
  type: 'invoke',
  name: 'adaptiveCard/action',
  channelId: 'msteams',
  serviceUrl: 'https://service',
  from: { id: '29:user' },
  recipient: { id: 'bot' },
  conversation: { id: 'conversation' },
  replyToId: 'base-card-id',
  value: { action: { type: 'Action.Execute', verb: 'refresh' }, trigger }
})

async function runAction (responseType: AdaptiveCardActionExecuteResponseType, trigger: 'automatic' | 'manual') {
  const adapter = new RecordingAdapter()
  const app = new AgentApplication({
    adapter: adapter as any,
    adaptiveCardsOptions: { actionExecuteResponseType: responseType }
  })
  app.adaptiveCards.actionExecute('refresh', async () => card())
  await app.runInternal(new TurnContext(adapter, invoke(trigger)))
  return adapter
}

describe('AdaptiveCardsActions', () => {
  it('returns an automatic refresh response without updating the shared card', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.REPLACE_FOR_ALL, 'automatic')

    assert.equal(adapter.updated.length, 0)
    assert.equal(adapter.sent.length, 1)
    const response = adapter.sent[0].value as { body: { type: string, value: Record<string, unknown> } }
    assert.equal(response.body.type, 'application/vnd.microsoft.card.adaptive')
    assert.notEqual(response.body.value.refresh, undefined)
  })

  it('returns an automatic refresh response for the interactor without publishing a card', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.REPLACE_FOR_INTERACTOR, 'automatic')
    const response = adapter.sent[0].value as { body: { type: string, value: Record<string, unknown> } }

    assert.equal(adapter.updated.length, 0)
    assert.equal(adapter.sent.length, 1)
    assert.equal(response.body.type, 'application/vnd.microsoft.card.adaptive')
    assert.notEqual(response.body.value.refresh, undefined)
  })

  it('returns an automatic refresh response without posting a new message', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL, 'automatic')
    const response = adapter.sent[0].value as { body: { type: string, value: Record<string, unknown> } }

    assert.equal(adapter.sent.filter(activity => activity.type === 'message').length, 0)
    assert.equal(response.body.type, 'application/vnd.microsoft.card.adaptive')
    assert.notEqual(response.body.value.refresh, undefined)
  })

  it('returns a manual refresh response for the interactor without publishing a card', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.REPLACE_FOR_INTERACTOR, 'manual')
    const response = adapter.sent[0].value as { body: { type: string, value: Record<string, unknown> } }

    assert.equal(adapter.updated.length, 0)
    assert.equal(adapter.sent.length, 1)
    assert.equal(response.body.type, 'application/vnd.microsoft.card.adaptive')
    assert.notEqual(response.body.value.refresh, undefined)
  })

  it('updates the shared card and returns the manual replace-for-all response', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.REPLACE_FOR_ALL, 'manual')
    const published = adapter.updated[0].attachments?.[0].content as Record<string, unknown>
    const response = adapter.sent[0].value as { body: { type: string, value: Record<string, unknown> } }

    assert.notEqual(published.refresh, undefined)
    assert.equal(response.body.type, 'application/vnd.microsoft.card.adaptive')
    assert.notEqual(response.body.value.refresh, undefined)
  })

  it('posts a new card after a manual new-message action', async () => {
    const adapter = await runAction(AdaptiveCardActionExecuteResponseType.NEW_MESSAGE_FOR_ALL, 'manual')
    const acknowledgement = adapter.sent[0].value as { body: { type: string } }
    const message = adapter.sent[1]
    const published = message.attachments?.[0].content as Record<string, unknown>

    assert.equal(adapter.updated.length, 0)
    assert.equal(adapter.sent.length, 2)
    assert.equal(acknowledgement.body.type, 'application/vnd.microsoft.activity.message')
    assert.equal(message.type, 'message')
    assert.notEqual(published.refresh, undefined)
  })
})
