/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { roleTypeZodSchema, RoleTypes } from './roleTypes'

/**
 * Interface representing a conversation account.
 */
export interface ConversationAccount {
  id: string
  conversationType?: string
  tenantId?: string
  isGroup?: boolean
  name?: string
  aadObjectId?: string
  role?: RoleTypes | string
  properties?: unknown
}

/**
 * Zod schema for validating a conversation account.
 */
export const conversationAccountZodSchema = z.object({
  isGroup: z.boolean().optional(),
  conversationType: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
  id: z.string().min(1),
  name: z.string().min(1).optional(),
  aadObjectId: z.string().min(1).optional(),
  role: z.union([roleTypeZodSchema, z.string().min(1)]).optional(),
  properties: z.unknown().optional()
})
