/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ChannelAccount } from '@microsoft/agents-bot-activity'

export interface ConversationParameters {
  isGroup: boolean
  bot: ChannelAccount
  members?: ChannelAccount[]
  topicName?: string
  tenantId?: string
  activity: Activity
  channelData: unknown
}
