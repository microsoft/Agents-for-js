/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationAccount } from '@microsoft/agents-activity'
import { MeetingDetails } from '../meeting/meetingDetails'
import { TeamsChannelAccount } from './teamsChannelAccount'

/**
 * Represents information about a meeting.
 */
export interface MeetingInfo {
  /**
   * Details of the meeting.
   */
  details: MeetingDetails;
  /**
   * Conversation account associated with the meeting.
   */
  conversation: ConversationAccount;
  /**
   * Organizer of the meeting.
   */
  organizer: TeamsChannelAccount;
}
