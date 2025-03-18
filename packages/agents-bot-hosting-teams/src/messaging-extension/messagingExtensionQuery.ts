/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { MessagingExtensionParameter, messagingExtensionParameterZodSchema } from './messagingExtensionParameter'
import { MessagingExtensionQueryOptions, messagingExtensionQueryOptionsZodSchema } from './messagingExtensionQueryOptions'

/**
 * Represents a query for a messaging extension.
 */
export interface MessagingExtensionQuery {
  /**
   * The ID of the command.
   */
  commandId?: string
  /**
   * A list of parameters for the query.
   */
  parameters?: MessagingExtensionParameter[]
  /**
   * Options for the query.
   */
  queryOptions?: MessagingExtensionQueryOptions
  /**
   * The state of the query.
   */
  state?: string
}

/**
 * Zod schema for validating MessagingExtensionQuery.
 */
export const messagingExtensionQueryZodSchema = z.object({
  commandId: z.string().min(1).optional(),
  parameters: z.array(messagingExtensionParameterZodSchema).optional(),
  queryOptions: messagingExtensionQueryOptionsZodSchema.optional(),
  state: z.string().min(1).optional()
})
