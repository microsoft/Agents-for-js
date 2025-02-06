/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { ConversationAccount } from '@microsoft/agents-activity-schema'
import { Meeting } from './meeting'
import { TeamsChannelAccount } from '../../connector-client/teamsChannelAccount'

export interface TeamsMeetingParticipant {
  user?: TeamsChannelAccount;
  meeting?: Meeting;
  conversation?: ConversationAccount;
}
