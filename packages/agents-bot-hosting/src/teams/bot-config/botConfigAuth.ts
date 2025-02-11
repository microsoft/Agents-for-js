/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { SuggestedActions } from '@microsoft/agents-bot-activity'

export interface BotConfigAuth {
  suggestedActions?: SuggestedActions
  type: 'auth'
}
