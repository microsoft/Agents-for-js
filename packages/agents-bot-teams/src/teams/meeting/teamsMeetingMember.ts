/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from '../../connector-client/teamsChannelAccount'
import { UserMeetingDetails } from './userMeetingDetails'

export interface TeamsMeetingMember {
  user: TeamsChannelAccount
  meeting: UserMeetingDetails
}
