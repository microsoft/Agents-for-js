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
export function mergeRecordValues (target: Record<PropertyKey, unknown>, values: Record<PropertyKey, unknown>): void {
  for (const key of Reflect.ownKeys(values)) {
    if (!Object.prototype.propertyIsEnumerable.call(values, key)) {
      continue
    }

    const value = Reflect.get(values, key)
    if (value === undefined) {
      continue
    }

    const current = Reflect.get(target, key)

    if (isPlainObject(current) && isPlainObject(value)) {
      const merged = cloneRecordValue(current)
      mergeRecordValues(merged, value)
      Reflect.set(target, key, merged)
      continue
    }

    Reflect.set(target, key, cloneRecordValue(value))
  }
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
    const result: Record<PropertyKey, unknown> = {}
    for (const key of Reflect.ownKeys(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        Reflect.set(result, key, cloneRecordValue(Reflect.get(value, key)))
      }
    }
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
function isPlainObject (value: unknown): value is Record<PropertyKey, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}
