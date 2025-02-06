import { strict as assert } from 'assert'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { createSandbox, SinonSandbox, fake, SinonSpy } from 'sinon'
import { TurnContext } from '../../../src'
import { Activity } from '@microsoft/agents-activity-schema'
import { BotAdapter } from '../../../src/botAdapter'

const testMessage: Activity = Activity.fromObject({ text: 'test', type: 'message' })

// @ts-expect-error
class SimpleAdapter extends BotAdapter {
  async processRequest (activity: Activity, next: any) {
    const context = new TurnContext(this, activity)
    return await this.runMiddleware(context, next)
  }
}

describe('BotAdapter', function () {
  let sandbox: SinonSandbox
  beforeEach(function () {
    sandbox = createSandbox()
  })

  afterEach(function () {
    sandbox.restore()
  })

  const getNextFake = () => fake((_, next) => next())

  const getAdapter = () => new SimpleAdapter()

  describe('middleware handling', function () {
    it('should use() middleware individually', function () {
      const adapter = getAdapter()
      adapter.use(getNextFake()).use(getNextFake())
    })

    it('should use() a list of middleware', function () {
      const adapter = getAdapter()
      adapter.use(getNextFake(), getNextFake(), getNextFake())
    })

    it('should run all middleware', async function () {
      const adapter = getAdapter()

      const middlewares = [getNextFake(), getNextFake()]
      adapter.use(...middlewares)

      const handler = sandbox.fake((context) => {
        assert(context instanceof TurnContext, 'context is a TurnContext instance')
      })

      await adapter.processRequest(testMessage, handler)

      assert(
        middlewares.every((middleware) => middleware.called),
        'every middleware was called'
      )
      assert(handler.called, 'handler was called')
    })
  })

  describe('Get locale from activity', function () {
    it('should have locale', async function () {
      const adapter = getAdapter()
      const activity = testMessage
      activity.locale = 'de-DE'
      const handler = sandbox.fake((context) => {
        assert('de-DE', context.activity.locale)
        assert('de-DE', context.locale)
      })

      await adapter.processRequest(activity, handler)
    })
  })

  describe('onTurnError', function () {
    const label: string = 'error is thrown'
    const logic = () => {
      throw new Error()
    }
    it(`should reach onTurnError when a ${label}`, async function () {
      const adapter = getAdapter()

      // @ts-expect-error
      adapter.onTurnError = sandbox.fake((context, error) => {
        assert(context instanceof TurnContext, 'context is a TurnContext instance')
        assert(error, 'error is defined')
      })

      const handler = sandbox.fake(logic)

      await adapter.processRequest(testMessage, handler)

      assert(((adapter.onTurnError) as unknown as SinonSpy<[context: TurnContext, error: Error], void>).called, 'onTurnError was called')
      assert(handler.called, 'handler was called')
    })

    it(`should propagate error if a ${label} in onTurnError when a ${label} in handler`, async function () {
      const adapter = getAdapter()

      adapter.onTurnError = sandbox.fake((context, error) => {
        assert(context instanceof TurnContext, 'context is a TurnContext instance')
        assert(error, 'error is defined')
        return logic()
      })

      const handler = sandbox.fake(logic)

      await assert.rejects(
        adapter.processRequest(testMessage, handler),
        'unhandled onTurnError error should yield promise rejection'
      )

      assert(((adapter.onTurnError) as unknown as SinonSpy<[context: TurnContext, error: Error], void>).called, 'onTurnError was called')
      assert(handler.called, 'handler was called')
    })
  })

  describe('proxy context revocation', function () {
    it('should revoke after execution', async function () {
      const adapter = getAdapter()

      const handler = sandbox.fake((context) => {
        assert.doesNotThrow(() => context.activity, 'accessing context property succeeds before it is revoked')
      })

      await adapter.processRequest(testMessage, handler)
      assert(handler.called, 'handler was called')

      const [context] = handler.args[0]
      assert.throws(() => context.activity, 'accessing context property should throw since it has been revoked')
    })

    it('should revoke after unhandled error', async function () {
      const adapter = getAdapter()

      const handler = sandbox.fake(async () => await Promise.reject(new Error('error')))

      await assert.rejects(
        adapter.processRequest(testMessage, handler),
        'unhandled handler error should yield promise rejection'
      )
      assert(handler.called, 'handler was called')

      const contextArray = []
      contextArray.push(handler.args[0])
      // @ts-expect-error
      assert.throws(() => context.activity, 'accessing context property should throw since it has been revoked')
    })
  })
})
