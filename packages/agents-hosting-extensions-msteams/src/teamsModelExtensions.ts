// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { MessagingExtensionAction, TaskModuleRequest } from '@microsoft/teams.api'

type TeamsDataContainer = Pick<TaskModuleRequest, 'data'> | Pick<MessagingExtensionAction, 'data'> | null | undefined

function hasDataProperty (value: unknown): value is { data?: unknown } {
  return typeof value === 'object' && value !== null && Object.prototype.hasOwnProperty.call(value, 'data')
}

function getSourceData (source: TeamsDataContainer | unknown): unknown {
  return hasDataProperty(source) ? source.data : source
}

/**
 * Gets the data payload from a Teams task module request or message extension action as the specified type.
 *
 * @param request - Teams request or action that contains a `data` payload.
 * @returns The data payload cast to the requested type, or undefined when no data is present.
 */
export function teamsGetDataAs<T = unknown> (request: TeamsDataContainer): T | undefined {
  return request?.data == null ? undefined : request.data as T
}

/**
 * Gets a string property from a Teams task module request, message extension action, or raw data object.
 *
 * @param source - Teams request, Teams action, or raw data object to inspect.
 * @param key - Property name to read from the data object.
 * @param defaultValue - Value returned when the property is missing or is not a string.
 * @returns The string property value, the default value, or an empty string.
 */
export function teamsGetDataString (source: TeamsDataContainer | unknown, key: string, defaultValue?: string): string {
  const data = getSourceData(source)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return defaultValue ?? ''
  }

  const value = (data as Record<string, unknown>)[key]
  return typeof value === 'string' ? value : defaultValue ?? ''
}
