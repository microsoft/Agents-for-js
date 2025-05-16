/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ChannelAccount } from '@microsoft/agents-activity'

/**
 * Represents a Teams channel account.
 */
export interface TeamsChannelAccount extends ChannelAccount {
  /**
   * Given name of the user.
   */
  givenName?: string
  /**
   * Surname of the user.
   */
  surname?: string
  /**
   * Email address of the user.
   */
  email?: string
  /**
   * User principal name of the user.
   */
  userPrincipalName?: string
  /**
   * Tenant ID of the user.
   */
  tenantId?: string
  /**
   * Role of the user in the team.
   */
  userRole?: string
}
