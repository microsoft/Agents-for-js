/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplicationOptions, TurnState } from '@microsoft/agents-hosting'
import { TaskModulesOptions } from './task'
import { AdaptiveCardsOptions } from './adaptive-cards-actions'

export interface TeamsApplicationOptions<TState extends TurnState> extends AgentApplicationOptions<TState> {
  adaptiveCards?: AdaptiveCardsOptions
  taskModules?: TaskModulesOptions
  removeRecipientMention: boolean
}
