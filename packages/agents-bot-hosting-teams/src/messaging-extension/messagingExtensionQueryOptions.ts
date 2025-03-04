/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Represents query options for a messaging extension.
 */
export interface MessagingExtensionQueryOptions {
  /**
   * The number of items to skip.
   */
  skip?: number
  /**
   * The number of items to retrieve.
   */
  count?: number
}

/**
 * Zod schema for validating MessagingExtensionQueryOptions.
 */
export const messagingExtensionQueryOptionsZodSchema = z.object({
  skip: z.number().optional(),
  count: z.number().optional()
})
