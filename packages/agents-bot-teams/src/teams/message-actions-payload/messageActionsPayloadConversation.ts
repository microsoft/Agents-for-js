/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type ConversationIdentityType = 'team' | 'channel'

export interface MessageActionsPayloadConversation {
  conversationIdentityType?: ConversationIdentityType
  id?: string
  displayName?: string
}
