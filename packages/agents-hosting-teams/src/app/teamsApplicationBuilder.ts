/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationBuilder, TurnState } from '@microsoft/agents-hosting'
import { TeamsApplication } from './teamsApplication'
import { TeamsApplicationOptions } from './teamsApplicationOptions'

export class TeamsApplicationBuilder<TState extends TurnState> extends ApplicationBuilder<TState> {
  private _teamsOptions: Partial<TeamsApplicationOptions<TState>> = super.options

  public setRemoveRecipientMention (removeRecipientMention: boolean): this {
    this._teamsOptions.removeRecipientMention = removeRecipientMention
    return this
  }

  public build (): TeamsApplication<TState> {
    return new TeamsApplication(this._teamsOptions)
  }
}
