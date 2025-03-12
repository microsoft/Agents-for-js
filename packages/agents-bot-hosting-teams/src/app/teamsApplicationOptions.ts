/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationOptions, TurnState } from '@microsoft/agents-bot-hosting'
import { AdaptiveCardsOptions } from './adaptiveCardsOptions'
import { TaskModulesOptions } from './taskModulesOptions'

export interface TeamsApplicationOptions<TState extends TurnState> extends ApplicationOptions<TState> {
  adaptiveCards?: AdaptiveCardsOptions
  taskModules?: TaskModulesOptions
  removeRecipientMention: boolean
}
