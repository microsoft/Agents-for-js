/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import type { ChannelData } from '@microsoft/teams.api'

/**
 * Root-level validation for Teams channel data objects.
 *
 * The Teams SDK already defines the nested ChannelData shape. This parser
 * normalizes missing root data to an empty object, verifies non-nullish input is
 * an object, and preserves all properties as-is.
 */
const teamsChannelDataZodSchema = z.object({}).passthrough()

/**
 * Parses the given object as Teams ChannelData.
 *
 * @param {unknown} o - The value to parse.
 * @returns {ChannelData} - The parsed ChannelData.
 */
export function parseTeamsChannelData (o: unknown): ChannelData {
  if (o == null) {
    return {} as ChannelData
  }

  return teamsChannelDataZodSchema.parse(o) as ChannelData
}
