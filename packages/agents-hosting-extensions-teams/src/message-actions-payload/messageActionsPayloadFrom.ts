/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadApp } from './messageActionsPayloadApp'
import { MessageActionsPayloadConversation } from './messageActionsPayloadConversation'
import { MessageActionsPayloadUser } from './messageActionsPayloadUser'

/**
 * Represents the sender of the message in the message actions payload.
 */
export interface MessageActionsPayloadFrom {
  /**
   * The user who sent the message.
   */
  user?: MessageActionsPayloadUser
  /**
   * The application that sent the message.
   */
  application?: MessageActionsPayloadApp
  /**
   * The conversation in which the message was sent.
   */
  conversation?: MessageActionsPayloadConversation
}
