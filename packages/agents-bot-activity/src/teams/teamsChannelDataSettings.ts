/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelInfo, channelInfoZodSchema } from './channelInfo'

export interface TeamsChannelDataSettings {
  selectedChannel?: ChannelInfo
  [properties: string]: unknown
}

export const teamsChannelDataSettingsZodSchema = z.object({
  selectedChannel: channelInfoZodSchema.optional()
})
