/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelTypes, channelTypeZodSchema } from './channelTypes'

/**
 * Represents information about a channel.
 */
export interface ChannelInfo {
  /**
   * The ID of the channel.
   */
  id?: string
  /**
   * The name of the channel.
   */
  name?: string
  /**
   * The type of the channel.
   */
  type?: ChannelTypes
}

/**
 * Zod schema for validating ChannelInfo objects.
 */
export const channelInfoZodSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: channelTypeZodSchema.optional()
})
