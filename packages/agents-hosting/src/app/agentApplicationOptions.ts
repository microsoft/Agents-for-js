/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { CloudAdapter } from '../cloudAdapter'
import { InputFileDownloader } from './inputFileDownloader'
import { TurnState } from './turnState'
import { Storage } from '../storage'
import { AuthorizationHandlers } from './oauth/authorization'
import { AdaptiveCardsOptions } from './adaptiveCards'

export interface AgentApplicationOptions<TState extends TurnState> {
  /**
   * The adapter used for handling bot interactions.
   */
  adapter?: CloudAdapter;

  /**
   * The application ID of the agent.
   */
  agentAppId?: string;

  /**
   * The storage mechanism for persisting state.
   */
  storage?: Storage;

  /**
   * Whether to start a typing timer for the bot.
   */
  startTypingTimer: boolean;

  /**
   * Whether to enable long-running messages.
   */
  longRunningMessages: boolean;

  /**
   * A factory function to create the turn state.
   */
  turnStateFactory: () => TState;

  /**
   * An array of file downloaders for handling input files.
   */
  fileDownloaders?: InputFileDownloader<TState>[];

  /**
   * Handlers for managing authorization.
   */
  authorization?: AuthorizationHandlers;

  /**
   * Options for AdaptiveCard actions.
   */
  adaptiveCards?: AdaptiveCardsOptions
}
