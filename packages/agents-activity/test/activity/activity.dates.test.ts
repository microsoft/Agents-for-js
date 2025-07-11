import assert from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTypes } from '../../src'

describe('Activity with timestamp', () => {
  it('Default ctor sets timestamps as undefined', () => {
    const a: Activity = new Activity(ActivityTypes.Message)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.strictEqual(a.timestamp, undefined)
    assert.strictEqual(a.id, undefined)
  })

  it('get/set from date', () => {
    const d = new Date()
    const a: Activity = new Activity(ActivityTypes.Message)
    a.timestamp = d
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.notStrictEqual(a.timestamp, undefined)
    assert.strictEqual(a.timestamp, d)
  })

  it('deserialize from json', () => {
    const json = '{ "type" : "message", "timestamp" : "2024-11-11T06:06:49.004Z", "text" : "my Text" }'
    const a: Activity = Activity.fromJson(json)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    const expectedDate = '2024-11-11T06:06:49.004Z'
    assert.deepEqual(a.timestamp, expectedDate)
  })

  it('deserialize from json including locale in timestamp', () => {
    const json = '{ "type" : "message", "timestamp" : "2025-01-17T23:39:38.3954179+00:00", "text" : "my Text" }'
    const a: Activity = Activity.fromJson(json)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    const expectedDate = new Date('2025-01-17T23:39:38.395Z')
    assert.deepEqual(a.timestamp, expectedDate)
  })

  it('deserialize from json with locale', () => {
    const json = '{ "type" : "message", "localTimestamp" : "2024-11-18T10:36:31-08:00", "text" : "my Text" }'
    const a: Activity = Activity.fromJson(json)
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    const expectedDate = new Date('2024-11-18T10:36:31-08:00')
    assert.equal(a.localTimestamp?.toString(), expectedDate.toString())
  })

  it('from object with timestamp as date', () => {
    const obj = { type: 'message', timestamp: new Date(), text: 'my Text' }
    const a = Activity.fromObject(obj)
    const t = typeof a.timestamp
    assert.strictEqual(t, 'object')
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.equal(a.timestamp?.toLocaleString(), obj.timestamp.toLocaleString())
  })

  it('from object with localtimestamp as string', () => {
    const obj = { type: 'message', localTimestamp: '2025-06-27T20:40:54.244Z', text: 'my Text' }
    const a = Activity.fromObject(obj)
    const t = typeof a.localTimestamp
    assert.strictEqual(t, 'object')
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.equal(a.localTimestamp?.toLocaleString(), new Date(obj.localTimestamp).toLocaleString())
  })

  it('from object with localtimestamp as Date', () => {
    const now = new Date()
    const obj = { type: 'message', localTimestamp: now, text: 'my Text' }
    const a = Activity.fromObject(obj)
    const t = typeof a.localTimestamp
    assert.strictEqual(t, 'object')
    assert.strictEqual(a.type, 'message')
    assert.strictEqual(a.type, ActivityTypes.Message)
    assert.equal(a.localTimestamp?.toLocaleString(), new Date(obj.localTimestamp).toLocaleString())
  })
})
