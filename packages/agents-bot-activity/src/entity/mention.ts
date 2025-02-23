/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '../conversation/channelAccount'

export interface Mention {
  mentioned: ChannelAccount
  text: string
  type: string
}
