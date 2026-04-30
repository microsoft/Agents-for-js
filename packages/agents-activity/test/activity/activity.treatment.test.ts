import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTreatments, ActivityTypes, Entity } from '../../src'

describe('activity treatment roundtrip', () => {
  it('should roundtrip from object to json and back', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.text = 'Hello'
    activity.entities = [
      {
        type: 'activityTreatment',
        treatment: ActivityTreatments.Targeted,
      } as unknown as Entity
    ]

    const parsedValue = JSON.parse(JSON.stringify(activity))
    const act = Activity.fromObject(parsedValue)

    assert.strictEqual(act.type, ActivityTypes.Message)
    assert.strictEqual(act.text, 'Hello')
    assert.strictEqual(act.entities?.length, 1)
    assert.strictEqual(act.entities[0].type, 'activityTreatment')
    assert.strictEqual(act.entities[0].treatment, ActivityTreatments.Targeted)
  })
})

describe('isTargetedActivity', () => {
  it('returns false when entities is undefined', () => {
    const activity = new Activity(ActivityTypes.Message)
    assert.strictEqual(activity.isTargetedActivity(), false)
  })

  it('returns false when entities is empty', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.entities = []
    assert.strictEqual(activity.isTargetedActivity(), false)
  })

  it('returns false when entities contain only non-treatment entities', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.entities = [{ type: 'mention', mentioned: { id: 'u1', name: 'User' }, text: '@User' } as unknown as Entity]
    assert.strictEqual(activity.isTargetedActivity(), false)
  })

  it('returns false when type is activityTreatment but treatment is not targeted', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.entities = [{ type: 'activityTreatment', treatment: 'other' } as unknown as Entity]
    assert.strictEqual(activity.isTargetedActivity(), false)
  })

  it('returns true when a targeted treatment entity is present', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.entities = [{ type: 'activityTreatment', treatment: ActivityTreatments.Targeted } as unknown as Entity]
    assert.strictEqual(activity.isTargetedActivity(), true)
  })
})

describe('makeTargetedActivity', () => {
  it('adds entity when entities is undefined', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.conversation = { isGroup: true } as any
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities?.length, 1)
    assert.strictEqual(activity.entities![0].type, 'activityTreatment')
    assert.strictEqual(activity.entities![0].treatment, ActivityTreatments.Targeted)
  })

  it('adds entity when entities is empty', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.conversation = { isGroup: true } as any
    activity.entities = []
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities.length, 1)
  })

  it('is idempotent — calling twice does not add a duplicate', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.conversation = { isGroup: true } as any
    activity.makeTargetedActivity()
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities?.length, 1)
  })

  it('does not remove existing entities', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.conversation = { isGroup: true } as any
    activity.entities = [{ type: 'mention', mentioned: { id: 'u1', name: 'User' }, text: '@User' } as unknown as Entity]
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities.length, 2)
    assert.strictEqual(activity.entities[0].type, 'mention')
    assert.strictEqual(activity.entities[1].type, 'activityTreatment')
  })

  it('throws when conversation is not a group', () => {
    const activity = new Activity(ActivityTypes.Message)
    assert.throws(() => activity.makeTargetedActivity(), { code: -110008 })
  })
})
