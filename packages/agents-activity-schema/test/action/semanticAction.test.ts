import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Entity, SemanticAction, SemanticActionStateTypes } from '../../src'
import { semanticActionZodSchema } from '../../src/action/semanticAction'

describe('SemanticAction', () => {
  it('should create a SemanticAction with valid properties', () => {
    const entity: Entity = { type: 'type' }
    const entities = { entity }
    const action: SemanticAction = {
      id: 'id',
      state: SemanticActionStateTypes.Continue,
      entities
    }
    assert.strictEqual(action.state, SemanticActionStateTypes.Continue)
    assert.strictEqual(action.state, 'continue')
    assert.equal(action.id, 'id')
    assert.equal(action.entities, entities)
  })

  it('should throw an error if id is missing', () => {
    // @ts-expect-error
    const action: SemanticAction = { }
    assert.strictEqual(action.id, undefined)
  })

  it('should throw an error if state is missing', () => {
    // @ts-expect-error
    const action: SemanticAction = { }
    assert.strictEqual(action.state, undefined)
  })

  it('should throw an error if entities is missing', () => {
    // @ts-expect-error
    const action: SemanticAction = { }
    assert.strictEqual(action.entities, undefined)
  })
})

describe('SemanticAction json deserialization', () => {
  it('Deserialize with known id, state, entities', () => {
    const entity: Entity = { type: 'type' }
    const entities = { entity }
    const json = '{ "id": "id", "state": "continue", "entities": { "entity": { "type": "type" } } }'
    const action: SemanticAction = semanticActionZodSchema.parse(JSON.parse(json))
    assert.strictEqual(action.state, SemanticActionStateTypes.Continue)
    assert.strictEqual(action.state, 'continue')
    assert.equal(action.id, 'id')
    assert.deepEqual(action.entities, entities)
  })

  it('Deserialize with known id, entities and bad state', () => {
    const json = '{ "id": "id", "state": "new_state", "entities": { "entity": { "type": "type" } } }'
    const action: SemanticAction = semanticActionZodSchema.parse(JSON.parse(json))
    const entity: Entity = { type: 'type' }
    const entities = { entity }
    assert.strictEqual(action.state, 'new_state')
    assert.notEqual(action.state, SemanticActionStateTypes.Continue)
    assert.equal(action.id, 'id')
    assert.deepEqual(action.entities, entities)
  })
})
