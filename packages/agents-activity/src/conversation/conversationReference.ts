/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelAccount, channelAccountZodSchema } from './channelAccount'
import { ConversationAccount, conversationAccountZodSchema } from './conversationAccount'

/**
 * Interface representing a reference to a conversation.
 */
export interface ConversationReference {
  activityId?: string
  user?: ChannelAccount
  locale?: string
  agent?: ChannelAccount | undefined | null
  conversation: ConversationAccount
  channelId: string
  serviceUrl?: string | undefined
}

/**
 * Zod schema for validating a conversation reference.
 */
export const conversationReferenceZodSchema = z.object({
  activityId: z.string().min(1).optional(),
  user: channelAccountZodSchema.optional(),
  locale: z.string().min(1).optional(),
  agent: channelAccountZodSchema.optional().nullable(),
  conversation: conversationAccountZodSchema,
  channelId: z.string().min(1),
  serviceUrl: z.string().min(1).optional()
})
