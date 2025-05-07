/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplicationOptions, TurnState } from '@microsoft/agents-hosting'
import { TaskModulesOptions } from './task'
import { AdaptiveCardsOptions } from './adaptive-cards-actions'

/**
 * Options for configuring a TeamsApplication instance.
 * Extends the AgentApplicationOptions interface to include Teams-specific configuration options.
 * @template TState - The type of the turn state.
 */
export interface TeamsApplicationOptions<TState extends TurnState> extends AgentApplicationOptions<TState> {
  /**
   * Configuration options for adaptive cards.
   */
  adaptiveCards?: AdaptiveCardsOptions

  /**
   * Configuration options for task modules.
   */
  taskModules?: TaskModulesOptions

  /**
   * Indicates whether to remove recipient mentions from messages.
   */
  removeRecipientMention: boolean
}
