/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES, SpanCategories, SpanNames } from './constants.js'
import { createDebugLogger } from '../loggers/debug.js'
import type { SpanName } from '../types.js'
import { isBrowser } from '../utils/platform.js'

const logger = createDebugLogger('agents:telemetry')

const disabledSpans = (() => {
  let rawValue: string
  if (!isBrowser) {
    rawValue = (process.env[AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES] ?? '').trim().toUpperCase()
  } else {
    try {
      rawValue = (window.localStorage.getItem(AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES) ?? '').trim().toUpperCase()
    } catch {
      rawValue = ''
    }
  }

  if (!rawValue) {
    return []
  }

  const envCategories = rawValue
    .split(/[\s,]+/)
    .map((category) => category.trim())
    .filter(Boolean)

  const spanNames = Object.entries(SpanNames)

  const processed = new Set<string>()
  const result: SpanName[] = []
  for (const category of envCategories) {
    const prefixes = SpanCategories[category as keyof typeof SpanCategories]
    if (!prefixes) {
      logger.warn(`Invalid span category "${category}" in ${AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES}. Valid categories are: ${Object.keys(SpanCategories).join(', ')}`)
      continue
    }
    for (const prefix of prefixes) {
      if (processed.has(prefix)) {
        continue
      }
      processed.add(prefix)

      for (const [key, name] of spanNames) {
        if (key.startsWith(prefix)) {
          result.push(name)
        }
      }
    }
  }

  if (result.length > 0) {
    logger.debug('Disabled Span names:', result)
  }

  return result
})()

/**
 * Determines if a span is disabled based on its name and the `AGENTS_TELEMETRY_DISABLED_SPAN_CATEGORIES` environment variable or configuration setting.
 * @param name The name of the span to check.
 * @returns A boolean indicating whether the span is disabled.
 */
export function isSpanDisabled (name: SpanName): boolean {
  if (disabledSpans.length === 0) {
    return false
  }

  const result = disabledSpans.includes(name)
  logger.debug(`Span "${name}" disabled:`, result)
  return result
}
