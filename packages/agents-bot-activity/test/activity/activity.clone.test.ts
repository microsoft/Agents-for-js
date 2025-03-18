import assert from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes, ConversationReference } from '../../src'

describe('Activity class', () => {
  it('should clone an Activity object', () => {
    const originalActivityObj = {
      type: ActivityTypes.Message,
      id: 'id'
    }
    const originalActivity = Activity.fromObject(originalActivityObj)

    const clonedActivity = originalActivity.clone()

    assert.deepEqual(clonedActivity.id, originalActivity.id)
    assert.deepEqual(clonedActivity.type, originalActivity.type)

    assert.notStrictEqual(clonedActivity, originalActivity)
  })

  it('should correctly handle Date fields', () => {
    const originalActivityObj = {
      type: ActivityTypes.Message,
      id: 'id',
      timeStamp: new Date('2025-03-17T10:00:00Z')
    }
    const originalActivity = Activity.fromObject(originalActivityObj)

    const clonedActivity = originalActivity.clone()

    assert.deepEqual(clonedActivity.id, originalActivity.id)
    assert.deepEqual(clonedActivity.type, originalActivity.type)
    assert.deepEqual(clonedActivity.timestamp, originalActivity.timestamp)
  })

  it('should correctly handle nested objects', () => {
    const originalActivityObj = {
      type: ActivityTypes.Message,
      id: 'id',
      from: {
        id: 'channelId',
        name: 'channelName'
      }
    }
    const originalActivity = Activity.fromObject(originalActivityObj)

    const clonedActivity = originalActivity.clone()

    assert.deepEqual(clonedActivity.id, originalActivity.id)
    assert.deepEqual(clonedActivity.type, originalActivity.type)
    assert.deepEqual(clonedActivity.from, originalActivity.from)
    assert.deepEqual(clonedActivity.from!.id, originalActivity.from!.id)
    assert.deepEqual(clonedActivity.from!.name, originalActivity.from!.name)
  })

  it('should have access to Activity methods', () => {
    const channelId = 'channelId'
    const recipient = {
      id: channelId
    }
    const conversation = {
      id: 'conversationId'
    }
    const originalActivityObj = {
      type: ActivityTypes.Message,
      id: 'activityId',
      recipient,
      conversation,
      channelId,
      serviceUrl: 'serviceUrl'
    }
    const originalActivity = Activity.fromObject(originalActivityObj)
    const clonedActivity = originalActivity.clone()

    const convRef = clonedActivity.getConversationReference()
    const convRefExpected: ConversationReference = {
      activityId: 'activityId',
      user: clonedActivity.from,
      bot: recipient,
      conversation,
      channelId,
      locale: clonedActivity.locale,
      serviceUrl: 'serviceUrl'
    }

    assert.deepEqual(convRef, convRefExpected)

    assert.deepEqual(clonedActivity.id, originalActivity.id)
    assert.deepEqual(clonedActivity.type, originalActivity.type)
  })
})
