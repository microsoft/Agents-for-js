/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Utility function to prune undefined values from an object. This is useful for cleaning up configuration objects before logging or processing, ensuring that only defined values are included.
 * @param obj The object to prune
 * @returns A new object with all undefined values removed
 */
export const prune = <T extends Record<string, any>>(obj: T) => {
  const entries = Object.entries(obj).filter(([, value]) => value !== undefined)
  return Object.fromEntries(entries) as T
}

export const mergeDefined = <T extends Record<string, any>>(
  ...layers: readonly (Partial<T> | undefined)[]
): T => {
  const result: Partial<T> = {}
  for (const layer of layers) {
    if (layer) Object.assign(result, prune(layer))
  }
  return result as T
}
