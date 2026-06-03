/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Metric, TraceCallback, TraceContext, TraceFunction, TraceManagedContext } from '../types.js'

const noopFn = () => {}

/**
 * No-op trace implementation used when tracing is unavailable or disabled.
 */
export const noopTrace = function (target, callback) {
  return noopContext(callback)
} as TraceFunction

noopTrace.define = definition => definition

/**
 * No-op metric implementation used when the OTel metrics API is unavailable.
 */
export function noopMetric (): Metric {
  return {
    histogram: () => ({ record: noopFn }),
    counter: () => ({ add: noopFn }),
  }
}

/**
 * Creates a callback/manually-managed trace context that safely does nothing.
 */
export function noopContext<TRecord extends object, TActions extends object> (): TraceManagedContext<TRecord, TActions>
export function noopContext<TRecord extends object, TActions extends object, TReturn> (callback: TraceCallback<TRecord, TActions, TReturn>): TReturn
export function noopContext<TRecord extends object, TActions extends object, TReturn> (callback?: TraceCallback<TRecord, TActions, TReturn>): TraceManagedContext<TRecord, TActions> | TReturn {
  const actions = new Proxy({}, { get: () => noopFn }) as TActions
  const context: TraceContext<TRecord, TActions> = {
    record: noopFn,
    actions,
  }

  if (callback) {
    return callback(context)
  }

  const managedContext: TraceManagedContext<TRecord, TActions> = {
    record: context.record,
    actions: context.actions,
    end: noopFn,
    fail<T extends unknown> (error: T): T {
      return error
    },
  }

  return managedContext
}
