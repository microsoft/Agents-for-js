import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes, ProductInfo, addProductInfoToActivity } from '../../src'

describe('Product Info', () => {
  it('should read a Product Info with valid properties', () => {
    const activityObj = {
      type: 'message',
      channelId: 'TestChannel',
      entities: [{
        type: 'ProductInfo',
        id: 'Test',
      }]
    }
    const activity = Activity.fromObject(activityObj)
    assert.deepEqual(activityObj.entities, activity.entities)
  })

  it('should be accesible with type api', () => {
    const activityObj = {
      type: 'message',
      channelId: 'TestChannel',
      entities: [{
        type: 'ProductInfo',
        id: 'Test',
      }]
    }
    const activity = Activity.fromObject(activityObj)
    assert.strictEqual(activity.entities![0].type, 'ProductInfo')
    assert.strictEqual(activity.entities![0].id, 'Test')

    const prodInfo: ProductInfo = activity.entities![0] as ProductInfo
    assert.strictEqual(prodInfo.type, 'ProductInfo')
    assert.strictEqual(prodInfo.id, 'Test')
  })

  it('should serialize from obj', () => {
    const activity = new Activity(ActivityTypes.Message)
    addProductInfoToActivity(activity, 'Test')
    assert.deepEqual(activity.entities![0], {
      type: 'ProductInfo',
      id: 'Test'
    })
  })

  it('return subchannel', () => {
    const activityObj = {
      type: 'message',
      channelId: 'TestChannel',
      entities: [{
        type: 'ProductInfo',
        id: 'Test',
      }]
    }
    const activity = Activity.fromObject(activityObj)
    assert.strictEqual(activity.channelId, 'TestChannel')
    assert.strictEqual(activity.subChannel, 'Test')
  })

  it('return null subchannel', () => {
    const activityObj = {
      type: 'message',
      channelId: 'TestChannel',
    }
    const activity = Activity.fromObject(activityObj)
    assert.strictEqual(activity.channelId, 'TestChannel')
    assert.strictEqual(activity.subChannel, null)
  })
})
