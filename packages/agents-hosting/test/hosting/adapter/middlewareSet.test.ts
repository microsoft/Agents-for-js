import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { TurnContext } from '../../../src'
import { Activity } from '@microsoft/agents-activity'
import { BaseAdapter } from '../../../src/baseAdapter'
import { MiddlewareSet } from '../../../src/middlewareSet'

// @ts-expect-error
class SimpleAdapter extends BaseAdapter {}

const testMessage: Activity = Activity.fromObject({ text: 'test', type: 'message' })

const context = new TurnContext(new SimpleAdapter(), testMessage)

const noop = () => {
  // no-op
}

describe('MiddlewareSet', function () {
  // Generates middleware helper that itself generates middleware that pushes a value
  // on a stack. Returns the middleware generator function, the stack, and a clean
  // MiddlewareSet instance for testing
  const stackMiddleware = () => {
    const stack: any = []

    return {
      middleware: (value: any) => async (_: TurnContext, next: () => Promise<void>) => {
        stack.unshift(value)
        return await next()
      },
      set: new MiddlewareSet(),
      stack
    }
  }

  it('should use() middleware individually.', function () {
    const { middleware, set } = stackMiddleware()
    set.use(middleware('a')).use(middleware('b'))
  })

  it('should use() a list of middleware.', function () {
    const { middleware, set } = stackMiddleware()
    set.use(middleware('a'), middleware('b'), middleware('c'))
  })

  it('should run all middleware in order.', async function () {
    const { middleware, set, stack } = stackMiddleware()
    set.use(middleware(1), middleware(2), middleware(3))

    await set.run(context, async () => {
      assert.deepStrictEqual(stack, [3, 2, 1], 'stack holds expected values')
    })
  })

  it('should run a middleware set added to another middleware set.', async function () {
    const { middleware, set: child, stack } = stackMiddleware()

    child.use(middleware(1))
    const parent = new MiddlewareSet(child)

    await parent.run(context, async () => {
      assert.deepStrictEqual(stack, [1])
    })
  })

  it('should run middleware with a leading and trailing edge.', async function () {
    const { set, stack } = stackMiddleware()

    set.use(async (_, next) => {
      stack.unshift(1)

      await next()

      stack.unshift(2)
    })

    await set.run(context, async () => {
      stack.unshift(3)
    })

    assert.deepStrictEqual(stack, [2, 3, 1])
  })

  it('should support middleware added as an object.', async function () {
    const { middleware, set, stack } = stackMiddleware()

    set.use({ onTurn: middleware(1) }).use({ onTurn: middleware(2) })

    await set.run(context, async () => {
      assert.deepStrictEqual(stack, [2, 1])
    })
  })

  it('not calling next() should intercept other middleware and bot logic.', async function () {
    const { middleware, set, stack } = stackMiddleware()

    // @ts-expect-error
    set.use(middleware(1), noop, middleware(2))

    await set.run(context, async () => {
      assert.deepStrictEqual(stack, [1])
    })
  })

  it('should map an exception within middleware to a rejection.', async function () {
    const { middleware, set, stack } = stackMiddleware()

    set.use(middleware(1), async () => await Promise.reject(new Error('rejected')), middleware(2))

    // @ts-expect-error
    await assert.rejects(set.run(context, noop), (err) => {
      assert.strictEqual((err as Error).message, 'rejected')
      assert.deepStrictEqual(stack, [1])
      return true
    })
  })

  it('should throw an error if an invalid plugin type is added.', function () {
    // @ts-expect-error
    assert.throws(() => new MiddlewareSet().use('bogus'))
  })

  it('should support passing middleware into the constructor of the set.', async function () {
    const { middleware, stack } = stackMiddleware()

    const set = new MiddlewareSet(middleware(1), middleware(2), middleware(3))
    await set.run(context, async () => {
      assert.deepStrictEqual(stack, [3, 2, 1])
    })
  })

  it('should unroll middleware even if some later middleware rejects', async function () {
    const { middleware, set, stack } = stackMiddleware()

    set.use(
      middleware(1),
      async (_, next) => {
        try {
          stack.unshift(2)
          await next()
        } finally {
          stack.shift()
        }
      },
      async () => await Promise.reject(new Error('rejected')),
      middleware(4)
    )

    // @ts-expect-error
    await assert.rejects(set.run(context, noop), (err) => {
      assert.strictEqual((err as Error).message, 'rejected')
      assert.deepStrictEqual(stack, [1])
      return true
    })
  })

  it('should unroll middleware even if the next handler reject', async function () {
    const { middleware, set, stack } = stackMiddleware()

    set.use(middleware(1), async (_, next) => {
      try {
        stack.unshift(2)
        await next()
      } finally {
        stack.shift()
      }
    })

    await assert.rejects(
      set.run(context, async () => await Promise.reject(new Error('rejected'))),
      (err) => {
        assert.strictEqual((err as Error).message, 'rejected')
        assert.deepStrictEqual(stack, [1])
        return true
      }
    )
  })
})
