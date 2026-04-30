import assert from 'assert'
import { describe, it, mock } from 'node:test'
import { traceFactory } from '../../src/observability/trace'
import { SpanNames } from '../../src/observability/constants'

function createMockSpan () {
  return {
    setStatus: mock.fn(),
    recordException: mock.fn(),
    end: mock.fn(),
    setAttribute: mock.fn(),
    addEvent: mock.fn(),
  }
}

function createMockOTel (span?: ReturnType<typeof createMockSpan>) {
  const mockSpan = span ?? createMockSpan()
  return {
    otel: {
      trace: {
        getTracer: () => ({
          startSpan: () => mockSpan,
          startActiveSpan: (_name: string, fn: (span: any) => any) => fn(mockSpan),
        }),
      },
      SpanStatusCode: {
        OK: 1,
        ERROR: 2,
      },
    } as any,
    span: mockSpan,
  }
}

describe('traceFactory', () => {
  it('throws when no definition is provided', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)

    assert.throws(() => {
      (trace as any)(undefined)
    }, /Trace definition is required/)
  })

  it('throws for unrecognized span names', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)

    assert.throws(() => {
      trace({ name: 'invalid.span.name' as any, record: {}, end: () => {} })
    }, /Unrecognized span name/)
  })

  it('returns a managed context when called without callback', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    })

    assert.strictEqual(typeof result.record, 'function')
    assert.strictEqual(typeof result.end, 'function')
    assert.strictEqual(typeof result.fail, 'function')
  })

  it('managed context sets OK status and calls end on the span', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)
    let endCalled = false

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => { endCalled = true },
    })

    result.end()

    assert.strictEqual(span.setStatus.mock.callCount(), 1)
    assert.deepStrictEqual(span.setStatus.mock.calls[0].arguments, [{ code: 1 }])
    assert.strictEqual(span.end.mock.callCount(), 1)
    assert.ok(endCalled)
  })

  it('managed context sets ERROR status when fail is called before end', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    })

    const error = new Error('test-error')
    result.fail(error)
    result.end()

    assert.strictEqual(span.recordException.mock.callCount(), 1)
    assert.strictEqual(span.recordException.mock.calls[0].arguments[0], error)
    assert.strictEqual(span.setStatus.mock.callCount(), 1)
    assert.deepStrictEqual(span.setStatus.mock.calls[0].arguments[0], { code: 2, message: 'test-error' })
    assert.strictEqual(span.end.mock.callCount(), 1)
  })

  it('managed context fail returns the error', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    })

    const error = new Error('test')
    assert.strictEqual(result.fail(error), error)
  })

  it('managed context end is idempotent', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    })

    result.end()
    result.end()

    assert.strictEqual(span.end.mock.callCount(), 1)
  })

  it('invokes callback and returns its result', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace(
      { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
      (ctx) => {
        assert.strictEqual(typeof ctx.record, 'function')
        return 'callback-result'
      }
    )

    assert.strictEqual(result, 'callback-result')
  })

  it('callback mode sets OK status on success', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    trace(
      { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
      () => 'ok'
    )

    assert.strictEqual(span.setStatus.mock.callCount(), 1)
    assert.deepStrictEqual(span.setStatus.mock.calls[0].arguments, [{ code: 1 }])
    assert.strictEqual(span.end.mock.callCount(), 1)
  })

  it('callback mode records error and re-throws on failure', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)
    const error = new Error('callback-error')

    assert.throws(() => {
      trace(
        { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
        () => { throw error }
      )
    }, /callback-error/)

    assert.strictEqual(span.recordException.mock.callCount(), 1)
    assert.strictEqual(span.end.mock.callCount(), 1)
  })

  it('record tracks values set during the trace', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    let captured: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: { count: 0 },
        end: (ctx) => { captured = ctx.record },
      },
      (ctx) => {
        ctx.record({ count: 5 })
      }
    )

    assert.deepStrictEqual(captured, { count: 5 })
  })

  it('record initializes with default values from definition', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    let captured: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: { status: 'pending', count: 0 },
        end: (ctx) => { captured = ctx.record },
      },
      () => {}
    )

    assert.deepStrictEqual(captured, { status: 'pending', count: 0 })
  })

  it('end callback receives duration', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    let captured: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: {},
        end: (ctx) => { captured = ctx },
      },
      () => {}
    )

    assert.strictEqual(typeof captured.duration, 'number')
    assert.ok(captured.duration >= 0)
  })

  it('end callback receives error when trace fails', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    const error = new Error('end-error')
    let capturedError: any

    assert.throws(() => {
      trace(
        {
          name: SpanNames.ADAPTER_PROCESS,
          record: {},
          end: (ctx) => { capturedError = ctx.error },
        },
        () => { throw error }
      )
    })

    assert.strictEqual(capturedError, error)
  })

  it('end callback receives span', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)
    let capturedSpan: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: {},
        end: (ctx) => { capturedSpan = ctx.span },
      },
      () => {}
    )

    assert.strictEqual(capturedSpan, span)
  })

  it('actions are created from definition and passed to callback', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)
    let receivedActions: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: {},
        actions: (ctx) => {
          assert.strictEqual(ctx.span, span)
          return { doSomething: () => 'done' }
        },
        end: () => {},
      },
      (ctx) => {
        receivedActions = ctx.actions
      }
    )

    assert.strictEqual(typeof receivedActions.doSomething, 'function')
    assert.strictEqual(receivedActions.doSomething(), 'done')
  })

  it('actions default to empty object when not defined', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    let receivedActions: any

    trace(
      {
        name: SpanNames.ADAPTER_PROCESS,
        record: {},
        end: () => {},
      },
      (ctx) => {
        receivedActions = ctx.actions
      }
    )

    assert.deepStrictEqual(receivedActions, {})
  })

  it('captures non-Error exceptions with type name', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    assert.throws(() => {
      trace(
        { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
        // eslint-disable-next-line no-throw-literal
        () => { throw 'string-error' }
      )
    })

    assert.strictEqual(span.recordException.mock.callCount(), 1)
    assert.deepStrictEqual(span.recordException.mock.calls[0].arguments[0], {
      name: 'string',
      message: 'string-error',
    })
  })

  it('captures errors thrown in end callback without breaking span.end()', () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    const result = trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => { throw new Error('end-handler-error') },
    })

    result.end()

    // span.end() should still be called despite the error in end callback
    assert.strictEqual(span.end.mock.callCount(), 1)
    // The end handler error should be captured
    assert.strictEqual(span.recordException.mock.callCount(), 1)
  })

  it('define returns the definition as-is', () => {
    const { otel } = createMockOTel()
    const trace = traceFactory(otel)
    const def = { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} }

    assert.strictEqual(trace.define(def), def)
  })

  it('handles async callback and sets OK on success', async () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)

    const result = await trace(
      { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
      async () => {
        await Promise.resolve()
        return 'async-result'
      }
    )

    assert.strictEqual(result, 'async-result')
    assert.strictEqual(span.setStatus.mock.callCount(), 1)
    assert.deepStrictEqual(span.setStatus.mock.calls[0].arguments, [{ code: 1 }])
  })

  it('handles async callback error and records exception', async () => {
    const { otel, span } = createMockOTel()
    const trace = traceFactory(otel)
    const error = new Error('async-error')

    await assert.rejects(
      () => trace(
        { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
        async () => { throw error }
      ),
      /async-error/
    )

    assert.strictEqual(span.recordException.mock.callCount(), 1)
    assert.strictEqual(span.end.mock.callCount(), 1)
  })
})
