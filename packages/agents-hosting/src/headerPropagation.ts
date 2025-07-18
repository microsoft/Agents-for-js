/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

const definition: FilterDefinition = {
  propagate: [
    'x-ms-correlation-id',
  ],
}

/**
 * Filters the headers to propagate based on the definition.
 * @param headers The headers to filter based on the definition.
 * @returns The filtered headers.
 */
export function getHeadersToPropagate (headers: Record<string, string | string[] | undefined>) {
  const result: Record<string, string> = {}
  const normalizedHeaders = normalizeHeaders(headers)

  // Propagate headers
  for (const key of definition.propagate ?? []) {
    const lowerKey = key.toLowerCase()
    if (normalizedHeaders[lowerKey]) {
      result[lowerKey] = normalizedHeaders[lowerKey]
    }
  }

  // Add headers if not present
  for (const [key, value] of Object.entries(definition.add ?? {})) {
    const lowerKey = key.toLowerCase()
    if (!normalizedHeaders[lowerKey] && !result[lowerKey]) {
      result[lowerKey] = value
    }
  }

  // Concat headers if present
  for (const [key, value] of Object.entries(definition.concat ?? {})) {
    const lowerKey = key.toLowerCase()
    if (normalizedHeaders[lowerKey] && !result[lowerKey]) {
      result[lowerKey] = `${normalizedHeaders[lowerKey]} ${value}`
    }
  }

  // Override headers (always set)
  for (const [key, value] of Object.entries(definition.override ?? {})) {
    const lowerKey = key.toLowerCase()
    result[lowerKey] = value
  }

  return result
}

/**
 * Normalizes the headers by lowercasing the keys and ensuring the values are strings.
 */
function normalizeHeaders (headers: Record<string, string | string[] | undefined>) {
  return Object.entries(headers).reduce((acc, [key, value]) => {
    if (value) {
      acc[key.toLowerCase()] = Array.isArray(value) ? value.join(' ') : value
    }
    return acc
  }, {} as Record<string, string>)
}

/**
 * Definition to filter which headers to propagate to outgoing requests based on certain criterias:
 * - **propagate**: the incoming header can be passed as outgoing request.
 * - **add**: if there is no incoming header, a new header can be added and be passed as outgoing request.
 * - **concat**: takes the incoming header and concats a new value that can be passed as outgoing request.
 * - **override**: replaces the incoming header with a new one that can be passed as outgoing request.
 */
interface FilterDefinition {
  /**
   * Propagates the incoming header value to the header to propagate collection based on the header definition key.
   * If the header does not exist in the collection, it will be ignored.
   */
  propagate?: string[];

  /**
   * Adds a header definition to the header to propagate collection.
   * If the header already exist in the collection, it will be ignored.
   */
  add?: Record<string, string>;

  /**
   * Concat a header definition to the header to propagate collection.
   * If the header does not exist in the collection, it will be ignored.
   */
  concat?: Record<string, string>;

  /**
   * Overrides a header definition to the header to propagate collection.
   * If the header does not exist in the collection, it will add it.
   */
  override?: Record<string, string>;
}
