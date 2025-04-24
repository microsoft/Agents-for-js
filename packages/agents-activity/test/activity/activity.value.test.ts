import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { Activity } from '../../src'

describe('vale any roundtrip', () => {
  it('should roundtrip a json string', () => {
    const jsonWithString = { type: 'type', value: '{"a": "b"}' }
    const act = Activity.fromObject(jsonWithString)
    assert.strictEqual(act.value, '{"a": "b"}')
    const parsedValue = JSON.parse(act.value)
    assert.strictEqual(parsedValue.a, 'b')
  })

  it('should roundtrip an object', () => {
    const jsonWithString = { type: 'type', value: { a: 'b' } }
    const act = Activity.fromObject(jsonWithString)
    assert.deepEqual(act.value, { a: 'b' })
    assert.strictEqual(act.value.a, 'b')
  })
})
