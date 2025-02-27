/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from './teamsChannelAccount'

/**
 * Represents a paged result of Teams members.
 */
export interface TeamsPagedMembersResult {
  /**
   * Continuation token for fetching the next page of results.
   */
  continuationToken: string;
  /**
   * List of Teams channel accounts.
   */
  members: TeamsChannelAccount[];
}
