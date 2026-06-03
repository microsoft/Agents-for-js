/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isBrowser } from './platform.js'

/**
 * Reads a configuration setting from `localStorage` in the browser or `process.env` in Node.js.
 *
 * @remarks
 * - Browser storage access failures are ignored and treated as an empty value.
 */
export function getSetting (name:string) {
  if (isBrowser) {
    try {
      return window.localStorage.getItem(name) ?? ''
    } catch {
      // no-op
    }
  } else {
    return process.env[name] ?? ''
  }

  return ''
}
