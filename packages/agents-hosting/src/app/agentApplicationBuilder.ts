/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplication } from './agentApplication'
import { AgentApplicationOptions } from './agentApplicationOptions'
import { TurnState } from './turnState'
import { Storage } from '../storage'
import { AuthenticationOptions } from './oauth/authenticationOptions'

export class AgentApplicationBuilder<TState extends TurnState = TurnState> {
  protected _options: Partial<AgentApplicationOptions<TState>> = {}

  protected get options () {
    return this._options
  }

  public withStorage (storage: Storage): this {
    this._options.storage = storage
    return this
  }

  public withTurnStateFactory (turnStateFactory: () => TState): this {
    this._options.turnStateFactory = turnStateFactory
    return this
  }

  public setStartTypingTimer (startTypingTimer: boolean): this {
    this._options.startTypingTimer = startTypingTimer
    return this
  }

  public withAuthentication (authenticationOptions: AuthenticationOptions): this {
    this._options.authentication = authenticationOptions
    return this
  }

  public build (): AgentApplication<TState> {
    return new AgentApplication(this._options)
  }
}
