/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Enum expressing the users relationship to the current channel.
 */
export enum MembershipTypes {
  /**
   * The user is a direct member of a channel.
   */
  Direct = 'direct',

  /**
   * The user is a member of a channel through a group.
   */
  Transitive = 'transitive',
}
