/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplicationBuilder, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from './teamsApplication'
import { TeamsApplicationOptions } from './teamsApplicationOptions'

/**
 * A builder class for creating and configuring a TeamsApplication instance.
 * Extends the AgentApplicationBuilder class to provide additional Teams-specific configuration options.
 * @template TState - The type of the turn state.
 */
export class TeamsApplicationBuilder<TState extends TurnState> extends AgentApplicationBuilder<TState> {
  private _teamsOptions: Partial<TeamsApplicationOptions<TState>> = super.options

  /**
   * Sets whether to remove recipient mentions from messages.
   * @param removeRecipientMention - A boolean indicating whether to remove recipient mentions.
   * @returns The current instance of TeamsApplicationBuilder for method chaining.
   */
  public setRemoveRecipientMention (removeRecipientMention: boolean): this {
    this._teamsOptions.removeRecipientMention = removeRecipientMention
    return this
  }

  /**
   * Builds and returns a new TeamsApplication instance with the configured options.
   * @returns A new TeamsApplication instance.
   */
  public build (): TeamsApplication<TState> {
    return new TeamsApplication(this._teamsOptions)
  }
}
