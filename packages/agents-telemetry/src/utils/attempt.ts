/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export function isPromise<T> (value: T | Promise<T>): value is Promise<T> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    'then' in value &&
    typeof value.then === 'function'
  )
}

export function attempt<TResult> (options: {
  try: () => TResult,
  then?: (result: TResult) => TResult | void,
  catch?: (error: unknown) => void,
  finally?: () => void
}): TResult {
  let _isPromise = false
  try {
    const result = options.try()
    if (isPromise(result)) {
      _isPromise = true
      return result
        .then((res) => options.then?.(res) ?? res)
        .catch((error) => {
          options.catch?.(error)
          throw error
        })
        .finally(options.finally) as any
    }

    return options.then?.(result) ?? result
  } catch (error) {
    if (!_isPromise) {
      options.catch?.(error)
    }
    throw error
  } finally {
    if (!_isPromise) {
      options.finally?.()
    }
  }
}
