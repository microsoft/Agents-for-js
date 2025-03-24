/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Interface representing an attachment.
 */
export interface Attachment {
  contentType: string
  contentUrl?: string
  content?: unknown
  name?: string
  thumbnailUrl?: string
}

/**
 * Zod schema for validating attachments.
 */
export const attachmentZodSchema = z.object({
  contentType: z.string().min(1),
  contentUrl: z.string().min(1).optional(),
  content: z.unknown().optional(),
  name: z.string().min(1).optional(),
  thumbnailUrl: z.string().min(1).optional()
})
