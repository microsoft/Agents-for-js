/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from './ChannelAccount'

export interface PagedMembersResult {
  continuationToken: string
  members: ChannelAccount[]
}
