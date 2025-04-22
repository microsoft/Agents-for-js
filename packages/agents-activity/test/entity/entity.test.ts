import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity, Entity } from '../../src'
import { entityZodSchema } from '../../src/entity/entity'

describe('Entity', () => {
  it('should create a Entity with valid properties', () => {
    const entity: Entity = { type: 'type' }
    assert.strictEqual(entity.type, 'type')
  })

  it('should throw an error if type is missing', () => {
    // @ts-expect-error
    const entity: Entity = { }
    assert.strictEqual(entity.type, undefined)
  })

  it('should respect unknown fields', () => {
    const entityObj: Entity = { type: 'type', unknownField: 'unknown' }
    const entity = entityZodSchema.passthrough().parse(entityObj)
    assert.deepEqual(entityObj, entity)
  })

  it('should respect unknown fields from activity', () => {
    const activityObj = {
      type: 'message',
      entities: [{
        type: 'mention',
        mentioned: {
          id: '123',
          name: 'John Doe'
        },
        text: 'Hello @John Doe',
      },
      {
        type: 'clientInfo',
        country: 'US',
        locale: 'en-US',
        platform: 'web',
        timezone: 'PST',
      }]
    }
    const activity = Activity.fromObject(activityObj)
    assert.deepEqual(activityObj.entities, activity.entities)
  })
})

describe('Entity json deserialization', () => {
  it('Deserialize with known type', () => {
    const json = '{ "type": "type" }'
    const entity: Entity = entityZodSchema.parse(JSON.parse(json))
    assert.strictEqual(entity.type, 'type')
  })
})
