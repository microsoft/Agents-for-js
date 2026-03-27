// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Span, OTel, SpanName } from './types'
import pkg from '../package.json'
import { attempt } from './utils/attempt'
import { SpanNames } from './constants'
import { isSpanDisabled } from './category'

export function traceFactory (otel: OTel) {
  const validSpanNames = new Set(Object.values(SpanNames))
  return function trace<TReturn> (name: SpanName, fn: (span: Span) => TReturn): TReturn {
    if (!validSpanNames.has(name)) {
      throw new Error(`Unrecognized span name "${name}". See SpanNames constants.`)
    }

    if (isSpanDisabled(name)) {
      const noopSpan = otel.trace.wrapSpanContext(otel.INVALID_SPAN_CONTEXT)
      return fn(noopSpan)
    }

    const tracer = otel.trace.getTracer(pkg.name, pkg.version)
    return tracer.startActiveSpan(name, (span) => {
      return attempt({
        try () {
          return fn(span)
        },
        then () {
          span.setStatus({ code: otel.SpanStatusCode.OK })
        },
        catch (error) {
          let message

          if (error instanceof Error) {
            message = error.message
            span.recordException(error)
          } else {
            message = String(error)
            span.recordException({ name: String(typeof error), message })
          }

          span.setStatus({ code: otel.SpanStatusCode.ERROR, message })
          throw error
        },
        finally () {
          span.end()
        }
      })
    })
  }
}
