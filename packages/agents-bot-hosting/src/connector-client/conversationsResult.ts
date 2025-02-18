/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationMembers } from './conversationMembers'

export interface ConversationsResult {
  continuationToken: string
  conversations: ConversationMembers[]
}
