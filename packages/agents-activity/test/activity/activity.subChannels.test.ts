import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity } from '../../src'
import { json } from 'stream/consumers'

describe('properly handle subchannel entities', () => {
  it('should deserialize into the expected channel id', () => {
    const object = {
      type: 'type',
      channelId: 'foo',
      entities: [
        {
          type: 'ProductInfo',
          id: 'bar',
        }
      ]
    }

    const activity = Activity.fromObject(object)

    assert.strictEqual(activity.channelId, 'foo:bar')
    assert.strictEqual(activity.channelIdChannel, 'foo')
    assert.strictEqual(activity.channelIdSubChannel, 'bar')
  })

  it('should serialize into the expected channel id and entities', () => {
    const activity = new Activity('message')
    activity.channelId = 'foo:bar'

    const jsonString = activity.toJsonString()
    const object = JSON.parse(jsonString)

    assert.strictEqual(object.channelId, 'foo')
    assert.strictEqual(object.entities[0].id, 'bar')
  })

  it('should allow super fancy subfield set', () => {
    const activity = new Activity('message')
    activity.channelIdChannel = 'foo'
    activity.channelIdSubChannel = 'bar'

    const jsonString = activity.toJsonString()
    const object = JSON.parse(jsonString)

    assert.strictEqual(object.channelId, 'foo')
    assert.strictEqual(object.entities[0].id, 'bar')
  })

  it('different methods of setting channel should serialize the same', () => {
    const a = new Activity('message')
    a.channelIdChannel = 'foo'
    a.channelIdSubChannel = 'bar'

    const jsonStringA = a.toJsonString()

    const b = new Activity('message')
    b.channelId = 'foo:bar'
    const jsonStringB = b.toJsonString()

    assert.strictEqual(jsonStringA, jsonStringB)

    const c = Activity.fromObject({
      type: 'message',
      channelId: 'foo',
      entities: [{
        id: 'bar',
        type: 'ProductInfo'
      }]
    })

    const jsonStringC = c.toJsonString()

    assert.strictEqual(jsonStringA, jsonStringC)
  })
})
