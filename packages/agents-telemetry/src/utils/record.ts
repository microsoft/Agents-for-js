/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Recursively merges record values into the target state.
 *
 * @remarks
 * - Plain objects are recursively merged.
 * - Arrays are copied and replaced.
 */
export function mergeRecordValues (target: Record<string, unknown>, values: Record<string, unknown>): void {
  Object.entries(values).forEach(([key, value]) => {
    const current = target[key]

    if (isPlainObject(current) && isPlainObject(value)) {
      const merged = { ...current }
      mergeRecordValues(merged, value)
      target[key] = merged
      return
    }

    target[key] = cloneRecordValue(value)
  })
}

/**
 * Clones record values while preserving non-plain objects by reference.
 *
 * @remarks
 * - Plain objects and arrays are cloned.
 * - Non-plain objects are kept by reference.
 */
export function cloneRecordValue<T> (value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => cloneRecordValue(item)) as T
  }

  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    Object.entries(value).forEach(([key, child]) => {
      result[key] = cloneRecordValue(child)
    })
    return result as T
  }

  return value
}

/**
 * Checks whether a value is a plain object that can be recursively merged.
 *
 * @remarks
 * Arrays and class instances are not considered plain objects.
 */
function isPlainObject (value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
