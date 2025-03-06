/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadAttachment } from './messageActionsPayloadAttachment'
import { MessageActionsPayloadBody } from './messageActionsPayloadBody'
import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'
import { MessageActionsPayloadMention } from './messageActionsPayloadMention'
import { MessageActionsPayloadReaction } from './messageActionsPayloadReaction'

/**
 * The type of message.
 */
export type MessageType = 'message'
/**
 * The importance of the message.
 */
export type Importance = 'normal' | 'high' | 'urgent'

/**
 * Represents the payload of a message action.
 */
export interface MessageActionsPayload {
  /**
   * The unique identifier of the message.
   */
  id?: string
  /**
   * The unique identifier of the message to which this message is a reply.
   */
  replyToId?: string
  /**
   * The type of message.
   */
  messageType?: MessageType
  /**
   * The date and time when the message was created.
   */
  createdDateTime?: string
  /**
   * The date and time when the message was last modified.
   */
  lastModifiedDateTime?: string
  /**
   * Indicates whether the message has been deleted.
   */
  deleted?: boolean
  /**
   * The subject of the message.
   */
  subject?: string
  /**
   * The summary of the message.
   */
  summary?: string
  /**
   * The importance of the message.
   */
  importance?: Importance
  /**
   * The locale of the message.
   */
  locale?: string
  /**
   * The link to the message.
   */
  linkToMessage?: string
  /**
   * The sender of the message.
   */
  from?: MessageActionsPayloadFrom
  /**
   * The body of the message.
   */
  body?: MessageActionsPayloadBody
  /**
   * The layout of the attachments.
   */
  attachmentLayout?: string
  /**
   * The attachments of the message.
   */
  attachments?: MessageActionsPayloadAttachment[]
  /**
   * The mentions in the message.
   */
  mentions?: MessageActionsPayloadMention[]
  /**
   * The reactions to the message.
   */
  reactions?: MessageActionsPayloadReaction[]
}
