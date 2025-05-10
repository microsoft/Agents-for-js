/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelInfo, channelInfoZodSchema } from './channelInfo'

/**
 * Represents settings for Teams channel data.
 */
export interface TeamsChannelDataSettings {
  /**
   * The selected channel information.
   */
  selectedChannel?: ChannelInfo
  /**
   * Additional properties.
   */
  [properties: string]: unknown
}

/**
 * Zod schema for validating TeamsChannelDataSettings objects.
 */
export const teamsChannelDataSettingsZodSchema = z.object({
  selectedChannel: channelInfoZodSchema.optional()
})
