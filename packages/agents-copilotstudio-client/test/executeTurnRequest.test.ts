import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { ExecuteTurnRequest } from '../src/executeTurnRequest'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

describe('ExecuteTurnRequest', function () {
  describe('constructor', function () {
    it('should create instance with activity', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Hello world',
        conversation: { id: 'test-conversation' }
      })

      const request = new ExecuteTurnRequest(activity)
      assert.strictEqual(request.activity, activity)
    })

    it('should create instance without activity', function () {
      const request = new ExecuteTurnRequest()
      assert.strictEqual(request.activity, undefined)
    })

    it('should create instance with undefined activity', function () {
      const request = new ExecuteTurnRequest(undefined)
      assert.strictEqual(request.activity, undefined)
    })

    it('should handle various activity types', function () {
      const activities = [
        {
          type: ActivityTypes.Message,
          text: 'Test message'
        },
        {
          type: ActivityTypes.Typing
        },
        {
          type: ActivityTypes.Event,
          name: 'testEvent'
        },
        {
          type: ActivityTypes.Invoke,
          name: 'testInvoke'
        }
      ]

      activities.forEach(activityData => {
        const activity = Activity.fromObject(activityData)
        const request = new ExecuteTurnRequest(activity)
        assert.strictEqual(request.activity, activity)
        assert.strictEqual(request.activity?.type, activityData.type)
      })
    })

    it('should handle activity with all properties', function () {
      const activityData = {
        type: 'message',
        id: 'test-activity-id',
        timestamp: new Date().toISOString(),
        from: { id: 'user123', name: 'Test User' },
        conversation: { id: 'conversation123' },
        recipient: { id: 'bot456', name: 'Test Bot' },
        text: 'Complete activity message',
        channelId: 'test-channel',
        serviceUrl: 'https://test.service.url'
      }

      const activity = Activity.fromObject(activityData)
      const request = new ExecuteTurnRequest(activity)

      assert.strictEqual(request.activity, activity)
      assert.strictEqual(request.activity?.text, activityData.text)
      assert.strictEqual(request.activity?.from?.id, activityData.from.id)
      assert.strictEqual(request.activity?.conversation?.id, activityData.conversation.id)
    })

    it('should handle activity with attachments', function () {
      const activityData = {
        type: 'message',
        text: 'Message with attachment',
        attachments: [
          {
            contentType: 'application/vnd.microsoft.card.adaptive',
            content: { type: 'AdaptiveCard', version: '1.0' }
          }
        ]
      }

      const activity = Activity.fromObject(activityData)
      const request = new ExecuteTurnRequest(activity)

      assert.strictEqual(request.activity, activity)
      assert(Array.isArray(request.activity?.attachments))
      assert.strictEqual(request.activity?.attachments?.length, 1)
    })

    it('should handle activity with entities', function () {
      const activityData = {
        type: 'message',
        text: 'Message with entities',
        entities: [
          {
            type: 'mention',
            text: '@user',
            mentioned: { id: 'user123', name: 'User' }
          }
        ]
      }

      const activity = Activity.fromObject(activityData)
      const request = new ExecuteTurnRequest(activity)

      assert.strictEqual(request.activity, activity)
      assert(Array.isArray(request.activity?.entities))
      assert.strictEqual(request.activity?.entities?.length, 1)
    })

    it('should maintain activity reference', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Reference test'
      })

      const request = new ExecuteTurnRequest(activity)

      // Verify it's the same reference
      assert.strictEqual(request.activity, activity)

      // Modify original activity
      activity.text = 'Modified text'

      // Request should reflect the change (same reference)
      assert.strictEqual(request.activity?.text, 'Modified text')
    })

    it('should work with complex conversation data', function () {
      const activityData = {
        type: 'message',
        text: 'Complex conversation message',
        conversation: {
          id: 'complex-conversation-123',
          name: 'Test Conversation',
          isGroup: true,
          conversationType: 'channel',
          tenantId: 'tenant-456'
        },
        channelData: {
          custom: 'channel specific data',
          metadata: { key: 'value' }
        }
      }

      const activity = Activity.fromObject(activityData)
      const request = new ExecuteTurnRequest(activity)

      assert.strictEqual(request.activity, activity)
      assert.strictEqual(request.activity?.conversation?.id, activityData.conversation.id)
      assert.strictEqual(request.activity?.conversation?.isGroup, activityData.conversation.isGroup)
    })
  })

  describe('serialization behavior', function () {
    it('should be serializable to JSON', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Serialization test',
        conversation: { id: 'test-conv' }
      })

      const request = new ExecuteTurnRequest(activity)
      const json = JSON.stringify(request)
      const parsed = JSON.parse(json)

      assert(parsed.activity)
      assert.strictEqual(parsed.activity.text, 'Serialization test')
      assert.strictEqual(parsed.activity.type, 'message')
    })

    it('should handle serialization with undefined activity', function () {
      const request = new ExecuteTurnRequest()
      const json = JSON.stringify(request)
      const parsed = JSON.parse(json)

      assert.strictEqual(parsed.activity, undefined)
    })
  })

  describe('property access', function () {
    it('should allow direct property access', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Property access test'
      })

      const request = new ExecuteTurnRequest(activity)

      // Test that we can access the activity property
      assert(request.activity)
      assert.strictEqual(request.activity.text, 'Property access test')

      // Test that we can modify the activity property
      request.activity = undefined
      assert.strictEqual(request.activity, undefined)
    })

    it('should support property enumeration', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Enumeration test'
      })

      const request = new ExecuteTurnRequest(activity)
      const properties = Object.keys(request)

      assert(properties.includes('activity'))
    })
  })

  describe('type safety', function () {
    it('should maintain proper type information', function () {
      const activity = Activity.fromObject({
        type: 'message',
        text: 'Type safety test'
      })

      const request = new ExecuteTurnRequest(activity)

      // Verify the request is of correct type
      assert(request instanceof ExecuteTurnRequest)

      // Verify the activity maintains its type
      assert(request.activity instanceof Activity)
    })
  })
})
