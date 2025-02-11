/* eslint-disable @typescript-eslint/no-unused-vars */
import assert from 'assert'
import { describe, it } from 'node:test'
import { ZodError } from 'zod'
import { Activity, ActivityTypes } from '../../src/'

describe('ActivityType enum validation', () => {
  Object.values(ActivityTypes).forEach(type => {
    it(`should create an Activity with type ${type}`, () => {
      const a: Activity = new Activity(type)
      assert.strictEqual(a.type, type)
    })
  })

  it('should fail to create an Activity with type null', () => {
    assert.throws(() => {
      const a: Activity = Activity.fromObject({ type: null })
    }, ZodError)
  })

  it('should fail to create an Activity with type empty', () => {
    assert.throws(() => {
      const a: Activity = Activity.fromObject({ type: '' })
    }, ZodError)
  })

  it('should fail to create an Activity with type undefined', () => {
    assert.throws(() => {
      const a: Activity = Activity.fromObject({ })
    }, ZodError)
  })
})
