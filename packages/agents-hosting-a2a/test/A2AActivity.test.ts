import { describe, it } from 'node:test'
import assert from 'assert'
import { Activity, RoleTypes } from '@microsoft/agents-activity'
import { TurnContext, BaseAdapter } from '@microsoft/agents-hosting'
import { a2aMessageToActivity, activityToA2AMessage } from '../src/adapter/A2AActivity'

class StubAdapter extends BaseAdapter {
  async sendActivities () { return [] }
  async updateActivity () {}
  async deleteActivity () {}
}

function makeTurnContext (activityOverrides: Partial<Activity> = {}): TurnContext {
  const activity = Activity.fromObject({
    type: 'message',
    text: 'hello',
    conversation: { id: 'task-1' },
    channelData: { contextId: 'ctx-1', taskId: 'task-1' },
    ...activityOverrides,
  })
  return new TurnContext(new StubAdapter(), activity)
}

describe('A2AActivity', () => {
  describe('a2aMessageToActivity', () => {
    it('should create a message activity from a request context', () => {
      const requestContext = {
        taskId: 'task-123',
        contextId: 'ctx-456',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'Hello agent' }],
          messageId: 'msg-1',
          kind: 'message',
        },
      } as any

      const activity = a2aMessageToActivity(requestContext)

      assert.strictEqual(activity.type, 'message')
      assert.strictEqual(activity.channelId, 'A2A')
      assert.strictEqual(activity.text, 'Hello agent')
      assert.strictEqual(activity.conversation?.id, 'task-123')
      assert.strictEqual(activity.channelData?.taskId, 'task-123')
      assert.strictEqual(activity.channelData?.contextId, 'ctx-456')
      assert.strictEqual(activity.from?.role, RoleTypes.Agent)
      assert.strictEqual(activity.recipient?.role, RoleTypes.User)
    })

    it('should join multiple text parts with newline', () => {
      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [
            { kind: 'text', text: 'Line 1' },
            { kind: 'text', text: 'Line 2' },
            { kind: 'text', text: 'Line 3' },
          ],
          messageId: 'msg-1',
          kind: 'message',
        },
      } as any

      const activity = a2aMessageToActivity(requestContext)

      assert.strictEqual(activity.text, 'Line 1\nLine 2\nLine 3')
    })

    it('should generate an activity id', () => {
      const requestContext = {
        taskId: 'task-1',
        contextId: 'ctx-1',
        userMessage: {
          role: 'user',
          parts: [{ kind: 'text', text: 'test' }],
          messageId: 'msg-1',
          kind: 'message',
        },
      } as any

      const activity = a2aMessageToActivity(requestContext)

      assert.ok(activity.id, 'Activity should have an id')
      assert.strictEqual(typeof activity.id, 'string')
    })
  })

  describe('activityToA2AMessage', () => {
    it('should convert a message activity to a status-update event', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'message',
        id: 'act-1',
        text: 'Hello user',
      })

      const result = activityToA2AMessage(context, activity) as any

      assert.strictEqual(result.kind, 'status-update')
      assert.strictEqual(result.taskId, 'task-1')
      assert.strictEqual(result.contextId, 'ctx-1')
      assert.strictEqual(result.final, false)
      assert.strictEqual(result.status.state, 'input-required')
      assert.strictEqual(result.status.message.role, 'agent')
      assert.strictEqual(result.status.message.parts[0].kind, 'text')
      assert.strictEqual(result.status.message.parts[0].text, 'Hello user')
    })

    it('should use empty string when activity text is undefined', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'message',
        id: 'act-2',
      })

      const result = activityToA2AMessage(context, activity) as any

      assert.strictEqual(result.status.message.parts[0].text, '')
    })

    it('should convert a typing activity with streaminfo entity to artifact-update', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'typing',
        text: 'streaming text...',
        entities: [{ type: 'streaminfo' }],
      })

      const result = activityToA2AMessage(context, activity) as any

      assert.strictEqual(result.kind, 'artifact-update')
      assert.strictEqual(result.taskId, 'task-1')
      assert.strictEqual(result.artifact.parts[0].text, 'streaming text...')
    })

    it('should use default text for typing without text', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'typing',
        entities: [{ type: 'streaminfo' }],
      })

      const result = activityToA2AMessage(context, activity) as any

      assert.strictEqual(result.artifact.parts[0].text, 'typing...')
    })

    it('should throw for unhandled activity types', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'event',
      })

      assert.throws(
        () => activityToA2AMessage(context, activity),
        (err: Error) => err.message.includes('Unhandled activity type on A2A channel: event')
      )
    })

    it('should throw for typing activity without streaminfo entity', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'typing',
        entities: [{ type: 'other' }],
      })

      assert.throws(
        () => activityToA2AMessage(context, activity),
        (err: Error) => err.message.includes('Unhandled activity type on A2A channel: typing')
      )
    })

    it('should throw for typing activity with no entities', () => {
      const context = makeTurnContext()
      const activity = Activity.fromObject({
        type: 'typing',
      })

      assert.throws(
        () => activityToA2AMessage(context, activity),
        (err: Error) => err.message.includes('Unhandled activity type on A2A channel: typing')
      )
    })
  })
})
