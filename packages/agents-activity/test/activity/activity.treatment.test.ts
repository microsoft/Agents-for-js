import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, ActivityTreatments, ActivityTypes, Entity, RoleTypes } from '../../src'

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

describe('withTargetedRecipient', () => {
  it('sets an account recipient and adds a targeted treatment', () => {
    const activity = new Activity(ActivityTypes.Message)
    const recipient = { id: 'user-id', name: 'User' }

    const result = activity.withTargetedRecipient(recipient)

    assert.strictEqual(result, activity)
    assert.strictEqual(activity.recipient, recipient)
    assert.strictEqual(activity.isTargetedActivity(), true)
  })

  it('creates a user recipient from an ID', () => {
    const activity = new Activity(ActivityTypes.Message)

    activity.withTargetedRecipient('user-id')

    assert.deepStrictEqual(activity.recipient, { id: 'user-id', role: RoleTypes.User })
  })

  it('replaces the recipient and collapses duplicate targeted treatments', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.recipient = { id: 'original-user' }
    activity.entities = [
      { type: 'activityTreatment', treatment: ActivityTreatments.Targeted },
      { type: 'custom' },
      { type: 'activityTreatment', treatment: ActivityTreatments.Targeted }
    ]

    activity.withTargetedRecipient('replacement-user')

    assert.strictEqual(activity.recipient.id, 'replacement-user')
    assert.deepStrictEqual(activity.entities.map(entity => entity.type), ['custom', 'activityTreatment'])
  })

  it('does not require conversation context', () => {
    const activity = new Activity(ActivityTypes.Message)

    assert.doesNotThrow(() => activity.withTargetedRecipient('user-id'))
  })

  it('rejects a missing recipient', () => {
    const activity = new Activity(ActivityTypes.Message)
    const missingRecipient = null as unknown as string

    assert.throws(
      () => activity.withTargetedRecipient(missingRecipient),
      { code: -110005 }
    )
  })
})

describe('makeTargetedActivity', () => {
  it('adds entity when entities is undefined', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.recipient = { id: 'user-id' }
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities?.length, 1)
    assert.strictEqual(activity.entities![0].type, 'activityTreatment')
    assert.strictEqual(activity.entities![0].treatment, ActivityTreatments.Targeted)
  })

  it('adds entity when entities is empty', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.recipient = { id: 'user-id' }
    activity.entities = []
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities.length, 1)
  })

  it('is idempotent — calling twice does not add a duplicate', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.recipient = { id: 'user-id' }
    activity.makeTargetedActivity()
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities?.length, 1)
  })

  it('does not remove existing entities', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.recipient = { id: 'user-id' }
    activity.entities = [{ type: 'mention', mentioned: { id: 'u1', name: 'User' }, text: '@User' } as unknown as Entity]
    activity.makeTargetedActivity()
    assert.strictEqual(activity.entities.length, 2)
    assert.strictEqual(activity.entities[0].type, 'mention')
    assert.strictEqual(activity.entities[1].type, 'activityTreatment')
  })

  it('does not require a group conversation', () => {
    const activity = new Activity(ActivityTypes.Message)
    activity.conversation = { id: 'conversation-id', isGroup: false }
    activity.recipient = { id: 'user-id' }

    assert.doesNotThrow(() => activity.makeTargetedActivity())
    assert.strictEqual(activity.isTargetedActivity(), true)
  })

  it('throws when recipient is undefined', () => {
    const activity = new Activity(ActivityTypes.Message)

    assert.throws(() => activity.makeTargetedActivity(), { code: -110009 })
  })
})
