import assert from 'assert'
import { describe, it } from 'node:test'
import { attempt, isPromise } from '../../src/utils/attempt'

describe('attempt', () => {
  it('returns the sync result and runs finally once', () => {
    let finallyCount = 0

    const result = attempt({
      try: () => 'ok',
      catch: error => {
        throw error
      },
      finally: () => {
        finallyCount += 1
      }
    })

    assert.strictEqual(result, 'ok')
    assert.strictEqual(finallyCount, 1)
  })

  it('routes sync errors through catch and still runs finally', () => {
    let finallyCount = 0

    assert.throws(() => {
      attempt({
        try: () => {
          throw new Error('boom')
        },
        catch: error => {
          throw new Error(`wrapped:${(error as Error).message}`)
        },
        finally: () => {
          finallyCount += 1
        }
      })
    }, /wrapped:boom/)

    assert.strictEqual(finallyCount, 1)
  })

  it('returns undefined when sync catch swallows the error and runs finally once', () => {
    let finallyCount = 0
    let caughtMessage = ''

    const result = attempt({
      try: () => {
        throw new Error('boom')
      },
      catch: error => {
        caughtMessage = (error as Error).message
      },
      finally: () => {
        finallyCount += 1
      }
    })

    assert.strictEqual(result, undefined)
    assert.strictEqual(caughtMessage, 'boom')
    assert.strictEqual(finallyCount, 1)
  })

  it('returns the sync result when finally is omitted', () => {
    const result = attempt({
      try: () => 'ok',
      catch: error => {
        throw error
      }
    })

    assert.strictEqual(result, 'ok')
  })

  it('returns the sync result when catch is omitted', () => {
    let finallyCount = 0

    const result = attempt({
      try: () => 'ok',
      finally: () => {
        finallyCount += 1
      }
    })

    assert.strictEqual(result, 'ok')
    assert.strictEqual(finallyCount, 1)
  })

  it('returns undefined when sync catch swallows the error and finally is omitted', () => {
    let caughtMessage = ''

    const result = attempt({
      try: () => {
        throw new Error('boom')
      },
      catch: error => {
        caughtMessage = (error as Error).message
      }
    })

    assert.strictEqual(result, undefined)
    assert.strictEqual(caughtMessage, 'boom')
  })

  it('rethrows when sync catch is omitted and try throws', () => {
    let finallyCount = 0

    assert.throws(() => {
      attempt({
        try: () => {
          throw new Error('boom')
        },
        finally: () => {
          finallyCount += 1
        }
      })
    }, /boom/)

    assert.strictEqual(finallyCount, 1)
  })

  it('waits for async completion before running finally', async () => {
    const events: string[] = []

    const result = await attempt({
      try: async () => {
        events.push('try:start')
        await Promise.resolve()
        events.push('try:end')
        return 'ok'
      },
      catch: error => {
        throw error
      },
      finally: () => {
        events.push('finally')
      }
    })

    assert.strictEqual(result, 'ok')
    assert.deepStrictEqual(events, ['try:start', 'try:end', 'finally'])
  })

  it('runs async catch before finally and only once', async () => {
    const events: string[] = []

    await assert.rejects(
      () => attempt({
        try: async () => {
          events.push('try:start')
          await Promise.resolve()
          throw new Error('boom')
        },
        catch: error => {
          events.push(`catch:${(error as Error).message}`)
          throw error
        },
        finally: () => {
          events.push('finally')
        }
      }),
      /boom/
    )

    assert.deepStrictEqual(events, ['try:start', 'catch:boom', 'finally'])
  })

  it('resolves undefined when async catch swallows the error before finally and only once', async () => {
    const events: string[] = []

    const result = await attempt({
      try: async () => {
        events.push('try:start')
        await Promise.resolve()
        throw new Error('boom')
      },
      catch: async error => {
        events.push(`catch:${(error as Error).message}`)
        await Promise.resolve()
      },
      finally: () => {
        events.push('finally')
      }
    })

    assert.strictEqual(result, undefined)
    assert.deepStrictEqual(events, ['try:start', 'catch:boom', 'finally'])
  })

  it('ignores async catch return values, resolves undefined, and runs finally once', async () => {
    const events: string[] = []

    const result = await attempt({
      try: async () => {
        events.push('try:start')
        await Promise.resolve()
        throw new Error('boom')
      },
      catch: async error => {
        events.push(`catch:${(error as Error).message}`)
        await Promise.resolve()
        return 'recovered'
      },
      finally: () => {
        events.push('finally')
      }
    })

    assert.strictEqual(result, undefined)
    assert.deepStrictEqual(events, ['try:start', 'catch:boom', 'finally'])
  })

  it('returns the async result when finally is omitted', async () => {
    const result = await attempt({
      try: async () => 'ok',
      catch: async error => {
        throw error
      }
    })

    assert.strictEqual(result, 'ok')
  })

  it('returns the async result when catch is omitted', async () => {
    const events: string[] = []

    const result = await attempt({
      try: async () => {
        events.push('try:start')
        await Promise.resolve()
        events.push('try:end')
        return 'ok'
      },
      finally: () => {
        events.push('finally')
      }
    })

    assert.strictEqual(result, 'ok')
    assert.deepStrictEqual(events, ['try:start', 'try:end', 'finally'])
  })

  it('resolves undefined when async catch swallows the error and finally is omitted', async () => {
    const events: string[] = []

    const result = await attempt({
      try: async () => {
        events.push('try:start')
        await Promise.resolve()
        throw new Error('boom')
      },
      catch: async error => {
        events.push(`catch:${(error as Error).message}`)
        await Promise.resolve()
      }
    })

    assert.strictEqual(result, undefined)
    assert.deepStrictEqual(events, ['try:start', 'catch:boom'])
  })

  it('rejects when async catch is omitted and try rejects', async () => {
    const events: string[] = []

    await assert.rejects(
      () => attempt({
        try: async () => {
          events.push('try:start')
          await Promise.resolve()
          throw new Error('boom')
        },
        finally: () => {
          events.push('finally')
        }
      }),
      /boom/
    )

    assert.deepStrictEqual(events, ['try:start', 'finally'])
  })
})

describe('isPromise', () => {
  it('returns true for a native Promise', () => {
    assert.strictEqual(isPromise(Promise.resolve()), true)
  })

  it('returns true for a thenable object', () => {
    assert.strictEqual(isPromise({ then: () => {} }), true)
  })

  it('returns false for a plain object without then', () => {
    assert.strictEqual(isPromise({ foo: 'bar' }), false)
  })

  it('returns false for a string', () => {
    assert.strictEqual(isPromise('hello'), false)
  })

  it('returns false for a number', () => {
    assert.strictEqual(isPromise(42), false)
  })

  it('returns false for null', () => {
    assert.strictEqual(isPromise(null), false)
  })

  it('returns false for undefined', () => {
    assert.strictEqual(isPromise(undefined), false)
  })

  it('returns false for a boolean', () => {
    assert.strictEqual(isPromise(true), false)
  })

  it('returns false when then is not a function', () => {
    assert.strictEqual(isPromise({ then: 'not-a-function' }), false)
  })

  it('returns true for a function with a then method', () => {
    const fn = () => {}
    fn.then = () => {}
    assert.strictEqual(isPromise(fn), true)
  })
})
