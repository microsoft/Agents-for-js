/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ApplicationOptions } from './applicationOptions'
import { TurnState } from './turnState'
import { Application, Storage } from '..'

/**
 * A builder class for simplifying the creation of an Application instance.
 * @template TState Optional. Type of the turn state. This allows for strongly typed access to the turn state.
 */
export class ApplicationBuilder<TState extends TurnState = TurnState> {
  private _options: Partial<ApplicationOptions<TState>> = {}

  /**
     * Configures the storage system to use for storing the bot's state.
     * @param {Storage} storage The storage system to use.
     * @returns {this} The ApplicationBuilder instance.
     */
  public withStorage (storage: Storage): this {
    this._options.storage = storage
    return this
  }

  /**
     * Configures the turn state factory for managing the bot's turn state.
     * @param {() => TState} turnStateFactory Factory used to create a custom turn state instance.
     * @returns {this} The ApplicationBuilder instance.
     */
  public withTurnStateFactory (turnStateFactory: () => TState): this {
    this._options.turnStateFactory = turnStateFactory
    return this
  }

  /**
     * Configures the typing timer when messages are received.
     * Default state for startTypingTimer is true
     * @param {boolean} startTypingTimer The boolean for starting the typing timer.
     * @returns {this} The ApplicationBuilder instance.
     */
  public setStartTypingTimer (startTypingTimer: boolean): this {
    this._options.startTypingTimer = startTypingTimer
    return this
  }

  /**
     * Builds and returns a new Application instance.
     * @returns {Application<TState>} The Application instance.
     */
  public build (): Application<TState> {
    return new Application(this._options)
  }
}
