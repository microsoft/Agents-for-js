/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from '../activity-extensions/teamsChannelAccount'
import { UserMeetingDetails } from './userMeetingDetails'

/**
 * Represents a member of a Teams meeting.
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
