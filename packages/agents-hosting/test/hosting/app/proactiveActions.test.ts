import { strict as assert } from 'assert'
import { describe, it, beforeEach } from 'node:test'
import { Activity, ActivityTypes, ConversationReference } from '@microsoft/agents-activity'
import { BaseAdapter } from '../../../src/baseAdapter'
import { AgentApplication, MemoryStorage, TurnContext, ResourceResponse } from '../../../src'
import { JwtPayload } from 'jsonwebtoken'
import { AttachmentData, AttachmentInfo } from '../../../src'

class ProactiveTestAdapter extends BaseAdapter {
  authConfig = { clientId: 'test-app-id', issuers: [] }
  public sentBatches: Activity[][] = []
  public continueCalls: Array<{ identity: JwtPayload; reference: ConversationReference }> = []

  async sendActivities (_context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    this.sentBatches.push(activities)
    return activities.map((_, index) => ({ id: `activity-${this.sentBatches.length}-${index}` }))
  }

  async continueConversation (
    botAppIdOrIdentity: string | JwtPayload,
    reference: Partial<ConversationReference>,
    logic: (revocableContext: TurnContext) => Promise<void>
  ): Promise<void> {
    const identity = typeof botAppIdOrIdentity === 'string'
      ? { aud: botAppIdOrIdentity }
      : botAppIdOrIdentity

    const activity = Activity.fromObject({
      type: ActivityTypes.Event,
      channelId: reference.channelId,
      serviceUrl: reference.serviceUrl,
      conversation: { id: reference.conversation?.id },
      recipient: reference.bot ?? { id: 'bot' },
      from: reference.user ?? { id: 'user' }
    })

    const turnContext = new TurnContext(this, activity, identity as JwtPayload)
    this.continueCalls.push({ identity: identity as JwtPayload, reference: reference as ConversationReference })
    await logic(turnContext)
  }

  // Unused abstract members
  updateActivity (): Promise<ResourceResponse | void> { throw new Error('Not implemented') }
  deleteActivity (): Promise<void> { throw new Error('Not implemented') }
  uploadAttachment (_context: TurnContext, _conversationId: string, _attachmentData: AttachmentData): Promise<ResourceResponse> { throw new Error('Not implemented') }
  getAttachmentInfo (): Promise<AttachmentInfo> { throw new Error('Not implemented') }
  getAttachment (): Promise<NodeJS.ReadableStream> { throw new Error('Not implemented') }
}

const createMessageActivity = () => Activity.fromObject({
  type: ActivityTypes.Message,
  text: 'hello world',
  channelId: 'msteams',
  serviceUrl: 'https://example.org',
  conversation: { id: 'conversation-1' },
  recipient: { id: 'bot-id' },
  from: { id: 'user-id' }
})

describe('ProactiveActions', () => {
  let adapter: ProactiveTestAdapter
  let storage: MemoryStorage
  let app: AgentApplication<any>
  const identity: JwtPayload = { aud: 'bot-app-id' } as JwtPayload

  beforeEach(() => {
    adapter = new ProactiveTestAdapter()
    storage = new MemoryStorage()
    app = new AgentApplication({
      adapter,
      storage,
      proactiveOptions: {
        autoPersistReferences: true,
        referenceTtlSeconds: 3600
      }
    })

    app.onActivity(ActivityTypes.Message, async (context) => {
      await context.sendActivity('ack')
    })
  })

  it('automatically persists conversation references after a turn', async () => {
    const activity = createMessageActivity()
    const context = new TurnContext(adapter, activity, identity)

    const handled = await app.runInternal(context)
    assert.equal(handled, true)

    const record = await app.proactive.getReference('conversation-1', 'msteams')
    assert.ok(record, 'reference should be stored')
    assert.equal(record?.identity.aud, 'bot-app-id')
    assert.equal(typeof record?.updatedUtc, 'string')
    assert.equal(record?.channelId, 'msteams')
  })

  it('sends proactive activities using stored references', async () => {
    const activity = createMessageActivity()
    const context = new TurnContext(adapter, activity, identity)
    await app.runInternal(context)

    const proactiveActivity = Activity.fromObject({
      type: ActivityTypes.Message,
      text: 'proactive message'
    })

    const result = await app.proactive.sendActivities('conversation-1', 'msteams', [proactiveActivity])
    assert.deepEqual(result.activityIds.length, 1)
    assert.equal(adapter.sentBatches.length, 2) // one from turn, one proactive
    assert.equal(adapter.sentBatches.at(-1)?.[0].text, 'proactive message')
  })

  it('removes expired references on retrieval', async () => {
    const activity = createMessageActivity()
    const reference = activity.getConversationReference()
    await app.proactive.saveReference('conversation-expired', 'msteams', identity, reference, 1)

    const key = 'proactive:msteams:conversation-expired'
    const stored = await storage.read([key]) as any
    stored[key].expiresUtc = new Date(Date.now() - 1000).toISOString()
    await storage.write({ [key]: stored[key] })

    const result = await app.proactive.getReference('conversation-expired', 'msteams')
    assert.equal(result, undefined)

    const after = await storage.read([key]) as any
    assert.equal(after[key], undefined)
  })

  it('throws when sending to an unknown conversation', async () => {
    await assert.rejects(
      () => app.proactive.sendActivities('missing', 'msteams', [Activity.fromObject({ type: ActivityTypes.Message })]),
      /No proactive reference found/
    )
  })
})
