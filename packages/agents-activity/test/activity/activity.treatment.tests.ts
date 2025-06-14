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
