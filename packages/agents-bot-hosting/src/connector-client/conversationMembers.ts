/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '../../../agents-bot-activity'

export interface ConversationMembers {
  id: string
  members: ChannelAccount[]
}
