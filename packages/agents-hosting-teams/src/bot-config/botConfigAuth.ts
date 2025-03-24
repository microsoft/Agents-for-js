/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { SuggestedActions } from '@microsoft/agents-hosting'

/**
 * Represents the bot configuration for authentication.
 */
export interface BotConfigAuth {
  /**
   * Optional suggested actions for the bot.
   */
  suggestedActions?: SuggestedActions
  /**
   * The type of configuration, which is 'auth'.
   */
  type: 'auth'
}
