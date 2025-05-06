/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'

/**
 * Represents a mention in the message actions payload.
 */
export interface MessageActionsPayloadMention {
  /**
   * The unique identifier of the mention.
   */
  id?: number
  /**
   * The text of the mention.
   */
  mentionText?: string
  /**
   * The entity that was mentioned.
   */
  mentioned?: MessageActionsPayloadFrom
}
