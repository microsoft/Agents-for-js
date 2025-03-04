/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents details of a Microsoft Teams team.
 */
export interface TeamDetails {
  /**
   * Unique identifier of the team.
   */
  id?: string;
  /**
   * Name of the team.
   */
  name?: string;
  /**
   * Azure Active Directory group ID of the team.
   */
  aadGroupId?: string;
  /**
   * Number of channels in the team.
   */
  channelCount?: number;
  /**
   * Number of members in the team.
   */
  memberCount?: number;
  /**
   * Type of the team.
   */
  type?: string;
}
