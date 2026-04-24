import assert from 'assert'
import { describe, it } from 'node:test'
import { index } from '../src/index.js'
import { SpanNames, MetricNames } from '../src/observability/constants'
import type { OTel, OTelLogs } from '../src/types.js'

function createMissingLoader () {
  return {
    otel (): never { throw new Error('not found') },
    logs (): never { throw new Error('not found') },
  }
}

describe('index', () => {
  it('returns a Factory with noop trace and metric when loader throws', () => {
    const factory = index(createMissingLoader())

    assert.deepStrictEqual(factory.SpanNames, SpanNames)
    assert.deepStrictEqual(factory.MetricNames, MetricNames)
    assert.strictEqual(typeof factory.trace, 'function')
    assert.strictEqual(typeof factory.metric.histogram, 'function')
    assert.strictEqual(typeof factory.metric.counter, 'function')
    assert.strictEqual(typeof factory.debug, 'function')
  })

  it('debug creates a logger with expected methods when otel-logs not available', () => {
    const factory = index(createMissingLoader())
    const logger = factory.debug('test:namespace')

    assert.strictEqual(typeof logger.info, 'function')
    assert.strictEqual(typeof logger.warn, 'function')
    assert.strictEqual(typeof logger.error, 'function')
    assert.strictEqual(typeof logger.debug, 'function')
  })

  it('noop trace can be called in managed mode without errors', () => {
    const factory = index(createMissingLoader())

    const result = factory.trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    } as any)

    assert.strictEqual(typeof result.end, 'function')
    assert.strictEqual(typeof result.fail, 'function')
    assert.doesNotThrow(() => result.end())
  })

  it('noop trace can be called with callback without errors', () => {
    const factory = index(createMissingLoader())

    const result = (factory.trace as Function)(
      { name: SpanNames.ADAPTER_PROCESS, record: {}, end: () => {} },
      (ctx: any) => {
        assert.ok(ctx.record)
        return 'ok'
      }
    )

    assert.strictEqual(result, 'ok')
  })

  it('noop metric histogram and counter are callable', () => {
    const factory = index(createMissingLoader())

    const histogram = factory.metric.histogram('test') as any
    const counter = factory.metric.counter('test') as any

    assert.doesNotThrow(() => histogram.record(1))
    assert.doesNotThrow(() => counter.add(1))
  })

  it('returns a Factory with real trace when loader succeeds with otel api', () => {
    const mockOTel = {
      trace: {
        getTracer: () => ({
          startSpan: () => ({
            setStatus: () => {},
            recordException: () => {},
            end: () => {},
          }),
          startActiveSpan: (_name: string, fn: Function) => fn({
            setStatus: () => {},
            recordException: () => {},
            end: () => {},
          }),
        }),
      },
      metrics: {
        getMeter: () => ({
          createHistogram: () => ({ record: () => {} }),
          createCounter: () => ({ add: () => {} }),
        }),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    }

    const factory = index({
      otel: () => mockOTel as unknown as OTel,
      logs: () => { throw new Error('not found') },
    })

    assert.strictEqual(typeof factory.trace, 'function')

    // Real trace should work
    const ctx = factory.trace({
      name: SpanNames.ADAPTER_PROCESS,
      record: {},
      end: () => {},
    })

    assert.strictEqual(typeof ctx.end, 'function')
    assert.doesNotThrow(() => ctx.end())
  })

  it('returns a Promise<Factory> when loader returns promises', async () => {
    const result = index({
      otel: async () => { throw new Error('not found') },
      logs: async () => { throw new Error('not found') },
    })

    assert.ok(result instanceof Promise)

    const factory = await result
    assert.deepStrictEqual(factory.SpanNames, SpanNames)
    assert.strictEqual(typeof factory.trace, 'function')
    assert.strictEqual(typeof factory.debug, 'function')
  })

  it('returns a Promise<Factory> with real trace when async loader succeeds', async () => {
    const mockOTel = {
      trace: {
        getTracer: () => ({
          startSpan: () => ({
            setStatus: () => {},
            recordException: () => {},
            end: () => {},
          }),
          startActiveSpan: (_name: string, fn: Function) => fn({
            setStatus: () => {},
            recordException: () => {},
            end: () => {},
          }),
        }),
      },
      metrics: {
        getMeter: () => ({
          createHistogram: () => ({ record: () => {} }),
          createCounter: () => ({ add: () => {} }),
        }),
      },
      SpanStatusCode: { OK: 1, ERROR: 2 },
    }

    const mockLogs = {
      logs: {
        getLogger: () => ({ emit: () => {} }),
      },
      SeverityNumber: { DEBUG: 5, INFO: 9, WARN: 13, ERROR: 17 },
    }

    const result = index({
      otel: async () => mockOTel as unknown as OTel,
      logs: async () => mockLogs as unknown as OTelLogs,
    })

    assert.ok(result instanceof Promise)

    const factory = await result
    assert.strictEqual(typeof factory.trace, 'function')
    assert.strictEqual(typeof factory.metric.histogram, 'function')
  })
})
