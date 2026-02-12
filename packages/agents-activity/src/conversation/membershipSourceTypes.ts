/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Enum defining the type of roster the user is a member of.
 */
export enum MembershipSourceTypes {
  /**
   * The source is that of a channel and the user is a member of that channel.
   */
  Channel = 'channel',

  /**
   * The source is that of a team and the user is a member of that team.
   */
  Team = 'team',
}
