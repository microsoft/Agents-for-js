/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { AttemptOptions } from '../types.js'

/**
 * Detects promise-like values returned by internal loaders and callbacks.
 */
export function isPromise<T> (value: T | Promise<T>): value is Promise<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

type SwallowingAttemptOptions<TResult> = AttemptOptions<TResult, void>
type RethrowingAttemptOptions<TResult> = AttemptOptions<TResult, never>

/**
 * Runs a callback and normalizes sync and async error/finally handling.
 *
 * @remarks
 * - If try succeeds, its result is returned.
 * - If try fails and catch is omitted, the original error is propagated.
 * - If try fails and catch throws, that error is propagated.
 * - If try fails and catch completes normally, the failure is treated as swallowed
 *   and attempt returns or resolves to undefined.
 * - catch is side-effect only; any value it returns is ignored.
 * - Type narrowing is based on whether catch is omitted or its declared return type:
 *   omitted or never means the error is rethrown, void means the error may be swallowed.
 * - finally runs once for both sync and async paths.
 */
export function attempt<TResult> (options: RethrowingAttemptOptions<TResult>): TResult
export function attempt<TResult> (options: RethrowingAttemptOptions<Promise<TResult>>): Promise<TResult>
export function attempt<TResult> (options: SwallowingAttemptOptions<TResult>): TResult | undefined
export function attempt<TResult> (options: SwallowingAttemptOptions<Promise<TResult>>): Promise<TResult | undefined>
export function attempt<TResult> (options: AttemptOptions<TResult, void | never>) {
  // Note: order of overloads ensures correct typing.
  let isAsync = false
  try {
    const result = options.try()

    if (isPromise(result)) {
      isAsync = true
      return result
        .catch(error => {
          if (!options.catch) {
            throw error
          }
          const result = options.catch?.(error)
          if (isPromise(result)) {
            return result.then(() => undefined)
          }
          return undefined
        })
        .finally(options.finally)
    }

    return result
  } catch (error) {
    if (!options.catch) {
      throw error
    }
    options.catch(error)
    return undefined
  } finally {
    !isAsync && options.finally?.()
  }
}
