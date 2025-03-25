/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AgentState, TurnContext } from '@microsoft/agents-hosting'

/**
 * A collection of `AgentState` plugins that should be loaded or saved in parallel as a single unit.
 * See `AutoSaveStateMiddleware` for an implementation of this class.
 */
export class AgentStateSet {
  /**
     * Array of the sets `AgentState` plugins.
     */
  readonly agentStates: AgentState[] = []

  /**
     * Creates a new AgentStateSet instance.
     *
     * @param agentStates One or more AgentState plugins to register.
     */
  constructor (...agentStates: AgentState[]) {
    AgentStateSet.prototype.add.apply(this, agentStates)
  }

  /**
     * Registers one or more `AgentState` plugins with the set.
     *
     * @param agentStates One or more AgentState plugins to register.
     * @returns The updated AgentStateSet.
     */
  add (...agentStates: AgentState[]): this {
    agentStates.forEach((agentstate: AgentState) => {
      if (typeof agentstate.load === 'function' && typeof agentstate.saveChanges === 'function') {
        this.agentStates.push(agentstate)
      } else {
        throw new Error("AgentStateSet: a object was added that isn't an instance of AgentStateSet.")
      }
    })

    return this
  }

  /**
     * Calls `AgentState.load()` on all of the AgentState plugins in the set.
     *
     * @remarks
     * This will trigger all of the plugins to read in their state in parallel.
     *
     * @param context Context for current turn of conversation with the user.
     * @param force (Optional) If `true` the cache will be bypassed and the state will always be read in directly from storage. Defaults to `false`.
     */
  async loadAll (context: TurnContext, force = false): Promise<void> {
    const promises: Promise<any>[] = this.agentStates.map((agentstate: AgentState) => agentstate.load(context, force))

    await Promise.all(promises)
  }

  /**
     * Calls `AgentState.saveChanges()` on all of the AgentState plugins in the set.
     *
     * @remarks
     * This will trigger all of the plugins to write out their state in parallel.
     *
     * @param context Context for current turn of conversation with the user.
     * @param force (Optional) if `true` the state will always be written out regardless of its change state. Defaults to `false`.
     */
  async saveAllChanges (context: TurnContext, force = false): Promise<void> {
    const promises: Promise<void>[] = this.agentStates.map((agentstate: AgentState) =>
      agentstate.saveChanges(context, force)
    )

    await Promise.all(promises)
  }
}
