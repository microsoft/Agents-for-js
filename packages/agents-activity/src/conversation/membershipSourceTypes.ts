/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'

/**
 * Enum defining the type of roster the user is a member of.
 */
export enum MembershipSourceTypes {
  /**
   * The user is a direct member of the current channel.
   */
  Channel = 'channel',

  /**
   * The user is a member of a team that is a member of the current channel.
   */
  Team = 'team',
}

/**
 * Zod schema for validating membership source types.
 */
export const membershipSourceTypeZodSchema = z.enum(['channel', 'team'])
