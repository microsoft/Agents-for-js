/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '@microsoft/agents-bot-activity'

export interface ConversationMembers {
  id: string
  members: ChannelAccount[]
}
