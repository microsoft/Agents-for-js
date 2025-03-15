/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplication } from './agentApplication'
import { ApplicationOptions } from './applicationOptions'
import { TurnState } from './turnState'
import { Storage } from '../storage'

export class ApplicationBuilder<TState extends TurnState = TurnState> {
  private _options: Partial<ApplicationOptions<TState>> = {}

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

  public build (): AgentApplication<TState> {
    return new AgentApplication(this._options)
  }
}
