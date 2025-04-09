/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationAccount } from '@microsoft/agents-activity'
import { Meeting } from './meeting'
import { TeamsChannelAccount } from '../connector-client/teamsChannelAccount'

/**
 * Interface representing a participant in a Teams meeting.
 */
export interface TeamsMeetingParticipant {
  /**
   * The user participating in the meeting.
   */
  user?: TeamsChannelAccount;

  /**
   * The meeting details.
   */
  meeting?: Meeting;

  /**
   * The conversation account associated with the meeting.
   */
  conversation?: ConversationAccount;
}
