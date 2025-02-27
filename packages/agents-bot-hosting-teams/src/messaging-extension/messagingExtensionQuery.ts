/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { MessagingExtensionParameter, messagingExtensionParameterZodSchema } from './messagingExtensionParameter'
import { MessagingExtensionQueryOptions, messagingExtensionQueryOptionsZodSchema } from './messagingExtensionQueryOptions'

export interface MessagingExtensionQuery {
  commandId?: string
  parameters?: MessagingExtensionParameter[]
  queryOptions?: MessagingExtensionQueryOptions
  state?: string
}

export const messagingExtensionQueryZodSchema = z.object({
  commandId: z.string().min(1).optional(),
  parameters: z.array(messagingExtensionParameterZodSchema).optional(),
  queryOptions: messagingExtensionQueryOptionsZodSchema.optional(),
  state: z.string().min(1).optional()
})
