/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type {
  Span,
  OTel,
  TraceDefinition,
  TraceFunction,
  TraceRecord,
} from '../types.js'
import { attempt } from '../utils/attempt.js'
import { isSpanDisabled } from './category.js'
import { SpanNames } from './constants.js'
import { noopContext } from '../utils/noop.js'

/**
 * Creates the trace helper bound to the package tracer.
 *
 * @remarks
 * - Only span names declared in `SpanNames` are accepted.
 * - Disabled span categories return a no-op context instead of creating a real span.
 */
export function traceFactory (otel: OTel) {
  const validSpanNames = new Set(Object.values(SpanNames))
  const tracer = otel.trace.getTracer('@microsoft/agents-telemetry')

  const trace = function trace (target, callback) {
    if (!target) {
      throw new Error('Trace definition is required')
    }

    if (!validSpanNames.has(target.name)) {
      throw new Error(`Unrecognized span name "${target.name}". See SpanNames constants.`)
    }

    if (isSpanDisabled(target.name)) {
      return noopContext(callback)
    }

    const record = createRecord(target)

    if (!callback) {
      // TODO: if parent/child span connections are needed, we could expose a 'child' function that internally connects them.
      const span = tracer.startSpan(target.name)
      const flow = start(otel, target, span, record)

      return {
        record: flow.record,
        actions: flow.actions,
        fail: flow.fail,
        end: flow.end
      }
    }

    return tracer.startActiveSpan(target.name, span => {
      const flow = start(otel, target, span, record)
      return attempt({
        try: () => callback({ record: flow.record, actions: flow.actions }),
        catch: (error) => { throw flow.fail(error) },
        finally: flow.end
      })
    })
  } as TraceFunction

  trace.define = definition => definition

  return trace
}

/**
 * Creates the mutable record stored for a trace execution.
 *
 * @remarks
 * - Updates use `Object.assign`, so nested objects are replaced rather than deeply merged.
 */
function createRecord<TRecord extends object, TActions extends object> (target: TraceDefinition<TRecord, TActions>): TraceRecord<TRecord> {
  const state: Partial<TRecord> = target.record ? { ...target.record } : {}

  return {
    set (values) {
      // TODO: use deep-merge strategy for Object and Array
      Object.assign(state, values)
    },
    get () {
      return state as Readonly<TRecord>
    }
  }
}

/**
 * Initializes a trace execution and returns the action helpers plus end/fail controls.
 */
function start<TRecord extends object, TActions extends object> (
  otel: OTel,
  target: TraceDefinition<TRecord, TActions>,
  span: Span,
  record: TraceRecord<TRecord>
) {
  const start = performance.now()
  let ended = false
  let _error: unknown

  return {
    record: record.set,
    actions: target.actions?.({ span }) ?? {} as TActions,
    fail<T extends unknown>(error: T): T {
      _error = error
      return error
    },
    end () {
      if (ended || !otel) {
        return
      }

      ended = true

      if (_error === undefined) {
        span.setStatus({ code: otel.SpanStatusCode.OK })
      } else {
        captureError(otel, span, _error)
      }

      try {
        target.end({
          span,
          record: record.get(),
          duration: performance.now() - start,
          error: _error,
        })
      } catch (endError) {
        captureError(otel, span, endError)
      } finally {
        span.end()
      }
    }
  }
}

/**
 * Records an error on the span and sets the span status to `ERROR`.
 *
 * @remarks
 * - Non-`Error` values are stringified so thrown primitives are still captured.
 */
function captureError (otel: OTel, span: Span, error: unknown) {
  let message

  if (error instanceof Error) {
    message = error.message
    span.recordException(error)
  } else {
    message = String(error)
    span.recordException({ name: String(typeof error), message })
  }

  span.setStatus({ code: otel.SpanStatusCode.ERROR, message })
}
