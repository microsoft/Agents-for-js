/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '../../../agents-bot-activity'

export interface TeamsChannelAccount extends ChannelAccount {
  givenName?: string
  surname?: string
  email?: string
  userPrincipalName?: string
  tenantId?: string
  userRole?: string
}
