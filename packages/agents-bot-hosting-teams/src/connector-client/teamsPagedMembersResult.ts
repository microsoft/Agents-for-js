/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from './teamsChannelAccount'

export interface TeamsPagedMembersResult {
  continuationToken: string;
  members: TeamsChannelAccount[];
}
