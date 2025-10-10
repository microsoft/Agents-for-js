/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationAccount } from '@microsoft/agents-activity'
import { Meeting } from './meeting'
import { TeamsChannelAccount } from '../activity-extensions/teamsChannelAccount'
import { TurnState } from '@microsoft/agents-hosting'

/**
 * Interface representing a participant in a Teams meeting.
 */
export interface TeamsMeetingParticipant<TState extends TurnState> {
  /**
   * The user participating in the meeting.
   */
  user?: TeamsChannelAccount;

  /**
   * The meeting details.
   */
  meeting?: Meeting<TState>;

  /**
   * The conversation account associated with the meeting.
   */
  conversation?: ConversationAccount;
}
