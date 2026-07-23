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
  TraceChildFunction,
  TraceCallback,
} from '../types.js'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { attempt } from '../utils/attempt.js'
import { isSpanDisabled } from './category.js'
import { SpanNames } from './constants.js'
import { noopContext } from '../utils/noop.js'
import { cloneRecordValue, mergeRecordValues } from '../utils/record.js'
import { Errors } from '../errorHelper.js'

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
    return runTrace(target, callback)
  } as TraceFunction

  function runTrace (
    target: TraceDefinition<any, any> | undefined,
    callback?: TraceCallback<any, any, unknown>,
    parentSpan?: Span
  ) {
    if (!target) {
      throw ExceptionHelper.generateException(Error, Errors.TraceDefinitionRequired)
    }

    if (!validSpanNames.has(target.name)) {
      throw ExceptionHelper.generateException(Error, Errors.UnrecognizedSpanName, undefined, { spanName: target.name })
    }

    if (isSpanDisabled(target.name)) {
      return callback ? noopContext(callback) : noopContext()
    }

    const execute = () => {
      const record = createRecord(target)

      if (!callback) {
        const span = tracer.startSpan(target.name)
        const flow = start(otel, target, span, record)
        const child = ((definition, childCallback) =>
          runTrace(definition, childCallback, span)) as TraceChildFunction

        return {
          record: flow.record,
          actions: flow.actions,
          child,
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
    }

    if (!parentSpan) {
      return execute()
    }

    const parentContext = otel.trace.setSpan(otel.context.active(), parentSpan)
    return otel.context.with(parentContext, execute)
  }

  trace.define = definition => definition

  return trace
}

/**
 * Creates the mutable record stored for a trace execution.
 *
 * @remarks
 * - Plain objects are recursively merged.
 * - Arrays are copied and replaced.
 */
function createRecord<TRecord extends object, TActions extends object> (target: TraceDefinition<TRecord, TActions>): TraceRecord<TRecord> {
  const state: Partial<TRecord> = target.record ? cloneRecordValue(target.record) : {}

  return {
    set (values) {
      mergeRecordValues(state as Record<string, unknown>, values as Record<string, unknown>)
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
