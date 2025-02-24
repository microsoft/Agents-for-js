/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '@microsoft/agents-bot-hosting'

export interface TeamsChannelAccount extends ChannelAccount {
  givenName?: string
  surname?: string
  email?: string
  userPrincipalName?: string
  tenantId?: string
  userRole?: string
}
