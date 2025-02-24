/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadAttachment } from './messageActionsPayloadAttachment'
import { MessageActionsPayloadBody } from './messageActionsPayloadBody'
import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'
import { MessageActionsPayloadMention } from './messageActionsPayloadMention'
import { MessageActionsPayloadReaction } from './messageActionsPayloadReaction'

export type MessageType = 'message'
export type Importance = 'normal' | 'high' | 'urgent'

export interface MessageActionsPayload {
  id?: string
  replyToId?: string
  messageType?: MessageType
  createdDateTime?: string
  lastModifiedDateTime?: string
  deleted?: boolean
  subject?: string
  summary?: string
  importance?: Importance
  locale?: string
  linkToMessage?: string
  from?: MessageActionsPayloadFrom
  body?: MessageActionsPayloadBody
  attachmentLayout?: string
  attachments?: MessageActionsPayloadAttachment[]
  mentions?: MessageActionsPayloadMention[]
  reactions?: MessageActionsPayloadReaction[]
}
