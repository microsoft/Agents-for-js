/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationOptions, TurnState } from '@microsoft/agents-hosting'
import { TaskModulesOptions } from './task'
import { AdaptiveCardsOptions } from './adaptive-cards-actions'

export interface TeamsApplicationOptions<TState extends TurnState> extends ApplicationOptions<TState> {
  adaptiveCards?: AdaptiveCardsOptions
  taskModules?: TaskModulesOptions
  removeRecipientMention: boolean
}
