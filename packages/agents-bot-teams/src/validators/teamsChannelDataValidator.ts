/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelData, teamsChannelDataZodSchema } from '../channel-data'

export function validateTeamsChannelData (o: object): TeamsChannelData {
  teamsChannelDataZodSchema.passthrough().parse(o)
  return o
}
