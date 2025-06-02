/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The type of conversation identity.
 */
export type ConversationIdentityType = 'team' | 'channel'

/**
 * Represents a conversation in the message actions payload.
 */
export interface MessageActionsPayloadConversation {
  /**
   * The type of conversation identity.
   */
  conversationIdentityType?: ConversationIdentityType
  /**
   * The unique identifier of the conversation.
   */
  id?: string
  /**
   * The display name of the conversation.
   */
  displayName?: string
}
