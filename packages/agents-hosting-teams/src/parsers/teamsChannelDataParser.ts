/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelData, teamsChannelDataZodSchema } from '../channel-data'

/**
 * Parses the given object as TeamsChannelData.
 *
 * @param {object} o - The object to parse.
 * @returns {TeamsChannelData} - The parsed TeamsChannelData.
 */
export function parseTeamsChannelData (o: object): TeamsChannelData {
  teamsChannelDataZodSchema.passthrough().parse(o)
  return o
}
