/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import type { ChannelData } from '@microsoft/teams.api'

/**
 * Root-level validation for Teams channel data objects.
 *
 * The Teams SDK already defines the nested ChannelData shape. This parser only
 * verifies that the payload is an object and preserves all properties as-is.
 */
const teamsChannelDataZodSchema = z.object({}).passthrough()

/**
 * Parses the given object as Teams ChannelData.
 *
 * @param {object} o - The object to parse.
 * @returns {ChannelData} - The parsed ChannelData.
 */
export function parseTeamsChannelData (o: object): ChannelData {
  return teamsChannelDataZodSchema.passthrough().parse(o) as ChannelData
}
