/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

export interface MessagingExtensionQueryOptions {
  skip?: number
  count?: number
}

export const messagingExtensionQueryOptionsZodSchema = z.object({
  skip: z.number().optional(),
  count: z.number().optional()
})
