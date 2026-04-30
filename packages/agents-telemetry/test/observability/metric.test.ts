import assert from 'assert'
import { describe, it, mock } from 'node:test'
import { metricFactory } from '../../src/observability/metric'

describe('metricFactory', () => {
  function createMockOTel () {
    const mockHistogram = { record: mock.fn() }
    const mockCounter = { add: mock.fn() }
    const createHistogram = mock.fn(() => mockHistogram)
    const createCounter = mock.fn(() => mockCounter)

    return {
      otel: {
        metrics: {
          getMeter: () => ({
            createHistogram,
            createCounter,
          }),
        },
      } as any,
      createHistogram,
      createCounter,
      mockHistogram,
      mockCounter,
    }
  }

  it('returns an object with histogram and counter methods', () => {
    const { otel } = createMockOTel()
    const metric = metricFactory(otel)

    assert.strictEqual(typeof metric.histogram, 'function')
    assert.strictEqual(typeof metric.counter, 'function')
  })

  it('histogram delegates to meter.createHistogram', () => {
    const { otel, createHistogram, mockHistogram } = createMockOTel()
    const metric = metricFactory(otel)

    const result = metric.histogram('test.duration')

    assert.strictEqual(createHistogram.mock.callCount(), 1)
    assert.strictEqual(createHistogram.mock.calls[0].arguments[0], 'test.duration')
    assert.strictEqual(result, mockHistogram)
  })

  it('counter delegates to meter.createCounter', () => {
    const { otel, createCounter, mockCounter } = createMockOTel()
    const metric = metricFactory(otel)

    const result = metric.counter('test.count')

    assert.strictEqual(createCounter.mock.callCount(), 1)
    assert.strictEqual(createCounter.mock.calls[0].arguments[0], 'test.count')
    assert.strictEqual(result, mockCounter)
  })
})
