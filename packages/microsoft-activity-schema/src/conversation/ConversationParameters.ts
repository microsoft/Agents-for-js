/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '../activity'
import { ChannelAccount } from './ChannelAccount'

export interface ConversationParameters {
  isGroup: boolean
  bot: ChannelAccount
  members?: ChannelAccount[]
  topicName?: string
  tenantId?: string
  activity: Activity
  channelData: unknown
}
