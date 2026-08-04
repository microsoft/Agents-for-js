/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import type { MessagingExtensionQuery } from '@microsoft/teams.api'

/**
 * Zod schema for validating MessagingExtensionQuery.
 * @ignore
 */
export const messagingExtensionQueryZodSchema = z.object({
  commandId: z.string().min(1).optional(),
  parameters: z.array(z.object({
    name: z.string().min(1).optional(),
    value: z.any().optional()
  })).optional(),
  queryOptions: z.object({
    skip: z.number().optional(),
    count: z.number().optional()
  }).optional(),
  state: z.string().min(1).optional()
}).passthrough()

/**
 * Parses the given value as a messaging extension query.
 *
 * @param {unknown} value - The value to parse.
 * @returns {MessagingExtensionQuery} - The parsed messaging extension query.
 */
export function parseValueMessagingExtensionQuery (value: unknown): MessagingExtensionQuery {
  return messagingExtensionQueryZodSchema.parse(value) as MessagingExtensionQuery
}
