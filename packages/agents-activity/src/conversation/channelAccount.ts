/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { roleTypeZodSchema, RoleTypes } from './roleTypes'

/**
 * Interface representing a channel account.
 */
export interface ChannelAccount {
  id?: string
  name?: string
  aadObjectId?: string
  role?: RoleTypes | string
  properties?: unknown
}

/**
 * Zod schema for validating a channel account.
 */
export const channelAccountZodSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().optional(),
  aadObjectId: z.string().min(1).optional(),
  role: z.union([roleTypeZodSchema, z.string().min(1)]).optional(),
  properties: z.unknown().optional()
})
