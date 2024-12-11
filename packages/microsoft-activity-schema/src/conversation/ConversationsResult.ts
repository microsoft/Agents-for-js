/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationMembers } from './ConversationMembers'

export interface ConversationsResult {
  continuationToken: string
  conversations: ConversationMembers[]
}
