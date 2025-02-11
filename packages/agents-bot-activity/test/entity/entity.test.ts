import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Entity } from '..'
import { entityZodSchema } from './entity'

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
})

describe('Entity json deserialization', () => {
  it('Deserialize with known type', () => {
    const json = '{ "type": "type" }'
    const entity: Entity = entityZodSchema.parse(JSON.parse(json))
    assert.strictEqual(entity.type, 'type')
  })
})
