/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelAccount, channelAccountZodSchema } from './ChannelAccount'
import { ConversationAccount, conversationAccountZodSchema } from './ConversationAccount'

export interface ConversationReference {
  activityId?: string
  user?: ChannelAccount
  locale?: string
  bot: ChannelAccount
  conversation: ConversationAccount
  channelId: string
  serviceUrl: string
}

export const conversationReferenceZodSchema = z.object({
  activityId: z.string().min(1).optional(),
  user: channelAccountZodSchema.optional(),
  locale: z.string().min(1).optional(),
  bot: channelAccountZodSchema,
  conversation: conversationAccountZodSchema,
  channelId: z.string().min(1),
  serviceUrl: z.string().min(1)
})
