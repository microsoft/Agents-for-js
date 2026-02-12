/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MembershipSourceTypes } from './membershipSourceTypes'
import { MembershipTypes } from './membershipTypes'

/**
 * Interface representing a membership source.
 */
export interface MembershipSource {
  /**
   * The type of roster the user is a member of.
   */
  sourceType: MembershipSourceTypes;

  /**
   * The unique identifier of the membership source.
   */
  id: string

  /**
   * The users relationship to the current channel.
   */
  membershipType: MembershipTypes;

  /**
   * The group ID of the team associated with this membership source.
   */
  teamGroupId: string

  /**
   * Optional. The tenant ID for the user.
   */
  tenantId?: string
}
