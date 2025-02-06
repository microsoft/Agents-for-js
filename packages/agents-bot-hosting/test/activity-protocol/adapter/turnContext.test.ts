import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { AttachmentData, AttachmentInfo, MessageFactory, ResourceResponse, TurnContext } from '../../../src'
import { Activity, ActivityTypes, ConversationReference, DeliveryModes } from '@microsoft/agents-activity-schema'
import { BotAdapter } from '../../../src/botAdapter'

const activityId = 'activity ID'

const testMessage: Activity = Activity.fromObject(
  {
    type: 'message',
    id: '1234',
    text: 'test',
    from: { id: 'user', name: 'User Name' },
    recipient: { id: 'bot', name: 'Bot Name' },
    conversation: { id: 'convo', name: 'Convo Name' },
    channelId: 'UnitTest',
    serviceUrl: 'https://example.org'
  }
)

const testTraceMessage: Activity = Activity.fromObject(
  {
    type: 'trace',
    name: 'TestTrace',
    valueType: 'https://example.org/test/trace',
    label: 'Test Trace'
  }
)

class SimpleAdapter extends BotAdapter {
  getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }

  uploadAttachment (conversationId: string, attachmentData: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  async sendActivities (context: TurnContext, activities: Activity[]) {
    const responses: any = []
    assert(context, 'SimpleAdapter.sendActivities: missing context.')
    assert(activities, 'SimpleAdapter.sendActivities: missing activities.')
    assert(Array.isArray(activities), 'SimpleAdapter.sendActivities: activities not array.')
    assert(activities.length > 0, 'SimpleAdapter.sendActivities: empty activities array.')
    activities.forEach((a, i) => {
      assert(typeof a === 'object', `SimpleAdapter.sendActivities: activity[${i}] not an object.`)
      assert(typeof a.type === 'string', `SimpleAdapter.sendActivities: activity[${i}].type missing or invalid.`)
      responses.push({ id: '5678' })
    })
    return await Promise.resolve(responses)
  }

  async updateActivity (context: TurnContext, activity: Activity) {
    assert(context, 'SimpleAdapter.updateActivity: missing context.')
    assert(activity, 'SimpleAdapter.updateActivity: missing activity.')
    return await Promise.resolve()
  }

  async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>) {
    assert(context, 'SimpleAdapter.deleteActivity: missing context.')
    assert(reference, 'SimpleAdapter.deleteActivity: missing reference.')
    assert(
      reference.activityId === '1234',
            `SimpleAdapter.deleteActivity: invalid activityId of "${reference.activityId}".`
    )
    return await Promise.resolve()
  }

  async continueConversation (
    reference: Partial<ConversationReference>,
    logic: (revocableContext: TurnContext) => Promise<void>
  ) {
    return await Promise.resolve()
  }
}

describe('TurnContext', { timeout: 5000 }, function () {
  it('should have adapter.', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(context.adapter, 'missing property.')
    assert(context.adapter.deleteActivity, 'invalid property.')
  })

  it('should have activity.', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(context.activity, 'missing property.')
    assert(context.activity.type === 'message', 'invalid property.')
  })

  it("responded should start as 'false'.", function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(!context.responded, 'invalid value.')
  })

  it('should set responded.', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.responded = true
    assert(context.responded, 'responded not set.')
  })

  it('should throw if you set responded to false.', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.responded = true
    assert.throws(() => (context.responded = false), {
      message: "TurnContext: cannot set 'responded' to a value of 'false'."
    })
  })

  it('should cache a value using turnState.set() and services.get().', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(context.turnState.get('foo') === undefined, 'invalid initial state.')
    context.turnState.set('foo', 'bar')
    assert(
      context.turnState.get('foo') === 'bar',
            `invalid value of "${context.turnState.get('foo')}" after set().`
    )
  })

  it('should inspect a value using has().', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(!context.turnState.has('bar'), 'invalid initial state for has().')
    context.turnState.set('bar', 'foo')
    assert(context.turnState.has('bar'), 'invalid initial state for has() after set().')
    context.turnState.set('bar', undefined)
    assert(context.turnState.has('bar'), 'invalid initial state for has() after set(undefined).')
  })

  it('should be able to use a Symbol with set(), get(), and has().', function () {
    const key = Symbol('foo')
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    assert(!context.turnState.has(key), 'invalid initial state for has().')
    context.turnState.set(key, 'bar')
    assert(context.turnState.get(key) === 'bar', `invalid value of "${context.turnState.get(key)}" after set().`)
    context.turnState.set(key, undefined)
    assert(context.turnState.has(key), 'invalid initial state for has() after set(undefined).')
  })

  it('should push() and pop() a new turn state.', function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.turnState.set('foo', 'a')
    context.turnState.push('foo', 'b')
    assert(
      context.turnState.get('foo') === 'b',
            `invalid value of "${context.turnState.get('foo')}" after push().`
    )
    const old = context.turnState.pop('foo')
    assert(old === 'b', 'popped value not returned.')
    assert(context.turnState.get('foo') === 'a', `invalid value of "${context.turnState.get('foo')}" after pop().`)
  })

  it('should sendActivity() and set responded.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    const response = await context.sendActivity(testMessage)
    assert(response, 'response is missing.')
    assert(response.id === '5678', `invalid response id of "${response.id}" sent back.`)
    assert(context.responded, 'context.responded not set after send.')
  })

  it('should send a text message via sendActivity().', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    const response = await context.sendActivity('test')
    assert(response, 'response is missing.')
    assert(response.id === '5678', `invalid response id of "${response.id}" sent back.`)
  })

  it('should send a text message with speak and inputHint added.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onSendActivities(async (ctx, activities, _next) => {
      assert(Array.isArray(activities), 'activities not array.')
      assert(activities.length === 1, 'invalid count of activities.')
      assert(activities[0].text === 'test', 'text wrong.')
      assert(activities[0].speak === 'say test', 'speak worng.')
      assert(activities[0].inputHint === 'ignoringInput', 'inputHint wrong.')
      return []
    })
    await context.sendActivity('test', 'say test', 'ignoringInput')
  })

  it('should send a trace activity.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onSendActivities(async (ctx, activities, _next) => {
      assert(Array.isArray(activities), 'activities not array.')
      assert(activities.length === 1, 'invalid count of activities.')
      assert(activities[0].type === ActivityTypes.Trace, 'type wrong.')
      assert(activities[0].name === 'name-text', 'name wrong.')
      assert(activities[0].value === 'value-text', 'value worng.')
      assert(activities[0].valueType === 'valueType-text', 'valeuType wrong.')
      assert(activities[0].label === 'label-text', 'label wrong.')
      return []
    })
    await context.sendTraceActivity('name-text', 'value-text', 'valueType-text', 'label-text')
  })

  it('should send multiple activities via sendActivities().', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    const responses = await context.sendActivities([testMessage, testMessage, testMessage])
    assert(Array.isArray(responses), "responses isn't an array.")
    assert(responses.length > 0, 'empty responses array returned.')
    assert(responses.length === 3, `invalid responses array length of "${responses.length}" returned.`)
    assert(responses[0].id === '5678', `invalid response id of "${responses[0].id}" sent back.`)
  })

  it('should call onSendActivity() hook before delivery.', async function () {
    let count = 0
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onSendActivities(async (ctx, activities, next) => {
      assert(ctx, 'context not passed to hook')
      assert(activities, 'activity not passed to hook')
      count = activities.length
      return await next()
    })
    await context.sendActivity(testMessage)
    assert(count === 1, 'send hook not called.')
  })

  it('should allow interception of delivery in onSendActivity() hook.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onSendActivities(async (_ctx, _activities, _next) => {
      return []
    })
    const response = await context.sendActivity(testMessage)
    assert(response === undefined, 'call not intercepted.')
  })

  it('should call onUpdateActivity() hook before update.', async function () {
    let called = false
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onUpdateActivity(async (ctx, activity, next) => {
      assert(ctx, 'context not passed to hook')
      assert(activity, 'activity not passed to hook')
      called = true
      return await next()
    })
    await context.updateActivity(testMessage)
    assert(called, 'update hook not called.')
  })

  it('should be able to update an activity with MessageFactory', async function () {
    let called = false
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onUpdateActivity(async (ctx, activity, next) => {
      assert(ctx, 'context not passed to hook')
      assert(activity, 'activity not passed to hook')
      assert(activity.id === activityId, 'wrong activity passed to hook')
      assert(activity.conversation!.id === testMessage.conversation?.id, 'conversation ID not applied to activity')
      assert(activity.serviceUrl === testMessage.serviceUrl, 'service URL not applied to activity')
      called = true
      return await next()
    })
    const message = MessageFactory.text('test text')
    message.id = activityId
    await context.updateActivity(message)
    assert(called, 'update hook not called.')
  })

  it('should call onDeleteActivity() hook before delete by "id".', async function () {
    let called = false
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onDeleteActivity(async (ctx, reference, next) => {
      assert(ctx, 'context not passed to hook')
      assert(reference, 'missing reference')
      assert(reference.activityId === '1234', 'invalid activityId passed to hook')
      called = true
      return await next()
    })
    await context.deleteActivity('1234')
    assert(called, 'delete hook not called.')
  })

  it('should call onDeleteActivity() hook before delete by "reference".', async function () {
    let called = false
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onDeleteActivity(async (ctx, reference, next) => {
      assert(reference, 'missing reference')
      assert(reference.activityId === '1234', 'invalid activityId passed to hook')
      called = true
      return await next()
    })
    const conversationReference: ConversationReference = {
      activityId: '1234',
      user: { id: 'user1', name: 'User' },
      bot: { id: 'bot1', name: 'Bot' },
      conversation: { id: 'conversation1' },
      channelId: 'channel123',
      locale: 'en-US',
      serviceUrl: 'http://example.com'
    }
    await context.deleteActivity(conversationReference)
    assert(called, 'delete hook not called.')
  })

  it('should map an exception raised by a hook to a rejection.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    context.onDeleteActivity((_ctx, _reference, _next) => {
      throw new Error('failed')
    })
    await assert.rejects(async () => await context.deleteActivity('1234'), {
      message: 'failed'
    })
  })

  it('should not set TurnContext.responded to true if Trace activity is sent.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    await context.sendActivities([testTraceMessage])
    assert(!context.responded, 'responded was set to true.')
  })

  it('should not set TurnContext.responded to true if multiple Trace activities are sent.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)
    await context.sendActivities([testTraceMessage, testTraceMessage])
    assert(!context.responded, 'responded was set to true.')
  })

  it('should set TurnContext.responded to true if Trace and message activities are sent.', async function () {
    const context = new TurnContext(new SimpleAdapter(), testMessage)

    await context.sendActivities([testTraceMessage, testTraceMessage])
    assert(!context.responded, 'responded was set to true.')

    await context.sendActivities([testMessage])
    assert(context.responded, 'responded was not set to true.')
  })

  it('should add to bufferedReplyActivities if TurnContext.activity.deliveryMode === DeliveryModes.ExpectReplies', async function () {
    const activity: Activity = Activity.fromObject(JSON.parse(JSON.stringify(testMessage)))
    activity.deliveryMode = DeliveryModes.ExpectReplies
    const context = new TurnContext(new SimpleAdapter(), activity)

    const activities = [MessageFactory.text('test'), MessageFactory.text('second test')]
    const responses = await context.sendActivities(activities)

    assert.strictEqual(responses.length, 2)

    // For expectReplies all ResourceResponses should have no id.
    assert(responses.every((response) => response.id === ''))

    const replies = context.bufferedReplyActivities
    assert.strictEqual(replies.length, 2)
    assert.strictEqual(replies[0].text, 'test')
    assert.strictEqual(replies[1].text, 'second test')
  })
})
