/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationAccount } from '@microsoft/agents-bot-hosting'
import { MeetingDetails } from '../teams/meeting/meetingDetails'
import { TeamsChannelAccount } from './teamsChannelAccount'

export interface MeetingInfo {
  details: MeetingDetails;
  conversation: ConversationAccount;
  organizer: TeamsChannelAccount;
}
