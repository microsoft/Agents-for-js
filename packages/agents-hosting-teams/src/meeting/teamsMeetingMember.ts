/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from '../connector-client/teamsChannelAccount'
import { UserMeetingDetails } from './userMeetingDetails'

/**
 * Interface representing a member of a Teams meeting.
 */
export interface TeamsMeetingMember {
  /**
   * The user who is a member of the meeting.
   */
  user: TeamsChannelAccount;

  /**
   * The meeting details for the user.
   */
  meeting: UserMeetingDetails;
}
