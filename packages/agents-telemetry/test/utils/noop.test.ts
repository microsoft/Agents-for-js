import assert from 'assert'
import { describe, it } from 'node:test'
import { noopTrace, noopMetric, noopContext } from '../../src/utils/noop'

describe('noopTrace', () => {
  function callNoopTrace (target: any, callback?: any) {
    const result = noopTrace(target, callback) as any
    return { result }
  }

  it('returns a managed context when called without callback', () => {
    const { result } = callNoopTrace({ name: 'agents.adapter.process', record: {}, end: () => {} })

    assert.strictEqual(typeof result.record, 'function')
    assert.strictEqual(typeof result.end, 'function')
    assert.strictEqual(typeof result.fail, 'function')
  })

  it('end is callable and does nothing', () => {
    const { result } = callNoopTrace({ name: 'agents.adapter.process', record: {}, end: () => {} })
    assert.doesNotThrow(() => result.end())
  })

  it('fail returns the error passed to it', () => {
    const { result } = callNoopTrace({ name: 'agents.adapter.process', record: {}, end: () => {} })
    const error = new Error('test')
    assert.strictEqual(result.fail(error), error)
  })

  it('invokes callback when provided and returns its result', () => {
    const { result } = callNoopTrace(
      { name: 'agents.adapter.process', record: {}, end: () => {} },
      (ctx: any) => {
        assert.strictEqual(typeof ctx.record, 'function')
        assert.ok(ctx.actions)
        return 'callback-result'
      }
    )

    assert.strictEqual(result, 'callback-result')
  })

  it('actions proxy returns functions for any property', () => {
    const { result } = callNoopTrace({ name: 'agents.adapter.process', record: {}, end: () => {} })
    assert.strictEqual(typeof result.actions.anyAction, 'function')
    assert.strictEqual(typeof result.actions.anotherAction, 'function')
    assert.doesNotThrow(() => (result.actions as any).anyAction())
  })

  it('define returns the provided definition', () => {
    const def = { name: 'agents.adapter.process', record: {}, end: () => {} } as any
    assert.strictEqual(noopTrace.define(def), def)
  })
})

describe('noopMetric', () => {
  it('returns an object with histogram and counter methods', () => {
    const metric = noopMetric()
    assert.strictEqual(typeof metric.histogram, 'function')
    assert.strictEqual(typeof metric.counter, 'function')
  })

  it('histogram returns an object with a record method', () => {
    const metric = noopMetric()
    const histogram = metric.histogram('test') as any
    assert.strictEqual(typeof histogram.record, 'function')
    assert.doesNotThrow(() => histogram.record(1))
  })

  it('counter returns an object with an add method', () => {
    const metric = noopMetric()
    const counter = metric.counter('test') as any
    assert.strictEqual(typeof counter.add, 'function')
    assert.doesNotThrow(() => counter.add(1))
  })
})

describe('noopContext', () => {
  it('returns managed context when callback is not provided', () => {
    const result = noopContext() as any

    assert.strictEqual(typeof result.record, 'function')
    assert.strictEqual(typeof result.end, 'function')
    assert.strictEqual(typeof result.fail, 'function')
    assert.ok(result.actions)
  })

  it('record is callable and does not throw', () => {
    const result = noopContext() as any
    assert.doesNotThrow(() => result.record({ key: 'value' }))
  })

  it('actions proxy returns functions for any property access', () => {
    const result = noopContext() as any
    assert.strictEqual(typeof result.actions.anyAction, 'function')
    assert.strictEqual(typeof result.actions.anotherAction, 'function')
    assert.doesNotThrow(() => result.actions.anyAction())
  })

  it('invokes callback with record and actions when provided', () => {
    let called = false

    noopContext((ctx: any) => {
      called = true
      assert.strictEqual(typeof ctx.record, 'function')
      assert.ok(ctx.actions)
    })

    assert.ok(called)
  })

  it('returns the callback return value', () => {
    const result = noopContext(() => 'result')
    assert.strictEqual(result, 'result')
  })
})
