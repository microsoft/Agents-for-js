/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { SuggestedActions } from '../../../../agents-bot-activity/dist/src'

export interface BotConfigAuth {
  suggestedActions?: SuggestedActions
  type: 'auth'
}
