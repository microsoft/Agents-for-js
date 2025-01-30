/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface ChannelInfo {
  id?: string
  name?: string
  type?: string
}

export const channelInfoZodSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.string().min(1).optional()
})
