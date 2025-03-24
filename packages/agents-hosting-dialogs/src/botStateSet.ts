/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AgentState, TurnContext } from '@microsoft/agents-hosting'

/**
 * A collection of `BotState` plugins that should be loaded or saved in parallel as a single unit.
 * See `AutoSaveStateMiddleware` for an implementation of this class.
 */
export class BotStateSet {
  /**
     * Array of the sets `BotState` plugins.
     */
  readonly botStates: AgentState[] = []

  /**
     * Creates a new BotStateSet instance.
     *
     * @param botStates One or more BotState plugins to register.
     */
  constructor (...botStates: AgentState[]) {
    BotStateSet.prototype.add.apply(this, botStates)
  }

  /**
     * Registers one or more `BotState` plugins with the set.
     *
     * @param botStates One or more BotState plugins to register.
     * @returns The updated BotStateSet.
     */
  add (...botStates: AgentState[]): this {
    botStates.forEach((botstate: AgentState) => {
      if (typeof botstate.load === 'function' && typeof botstate.saveChanges === 'function') {
        this.botStates.push(botstate)
      } else {
        throw new Error("BotStateSet: a object was added that isn't an instance of BotState.")
      }
    })

    return this
  }

  /**
     * Calls `BotState.load()` on all of the BotState plugins in the set.
     *
     * @remarks
     * This will trigger all of the plugins to read in their state in parallel.
     *
     * @param context Context for current turn of conversation with the user.
     * @param force (Optional) If `true` the cache will be bypassed and the state will always be read in directly from storage. Defaults to `false`.
     */
  async loadAll (context: TurnContext, force = false): Promise<void> {
    const promises: Promise<any>[] = this.botStates.map((botstate: AgentState) => botstate.load(context, force))

    await Promise.all(promises)
  }

  /**
     * Calls `BotState.saveChanges()` on all of the BotState plugins in the set.
     *
     * @remarks
     * This will trigger all of the plugins to write out their state in parallel.
     *
     * @param context Context for current turn of conversation with the user.
     * @param force (Optional) if `true` the state will always be written out regardless of its change state. Defaults to `false`.
     */
  async saveAllChanges (context: TurnContext, force = false): Promise<void> {
    const promises: Promise<void>[] = this.botStates.map((botstate: AgentState) =>
      botstate.saveChanges(context, force)
    )

    await Promise.all(promises)
  }
}
