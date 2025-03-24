/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { AgentState } from '@microsoft/agents-hosting'
import { MemoryScope } from './memoryScope'
import { DialogContext } from '../../dialogContext'

/**
 * Base class for memory scopes based on AgentState.
 */
export class AgentStateMemoryScope extends MemoryScope {
  protected stateKey: string

  /**
     * Initializes a new instance of the AgentStateMemoryScope class.
     *
     * @param name name of the property.
     */
  constructor (name: string) {
    super(name, true)
  }

  /**
     * Get the backing memory for this scope.
     *
     * @param dialogContext current dialog context.
     * @returns Memory for the scope.
     */
  getMemory (dialogContext: DialogContext): object {
    const agentState: AgentState = dialogContext.context.turnState.get(this.stateKey)
    if (agentState) {
      return agentState.get(dialogContext.context)
    }

    return undefined
  }

  /**
     * Changes the backing object for the memory scope.
     *
     * @param dialogContext current dialog context
     * @param _memory memory
     */
  setMemory (dialogContext: DialogContext, _memory: object): void {
    const agentState = dialogContext.context.turnState.get(this.stateKey)
    if (!agentState) {
      throw new Error(`${this.stateKey} is not available.`)
    }
    throw new Error('You cannot replace the root AgentState object.')
  }

  /**
     * Populates the state cache for this AgentState from the storage layer.
     *
     * @param dialogContext The DialogContext object for this turn.
     * @param force Optional, `true` to overwrite any existing state cache;
     * or `false` to load state from storage only if the cache doesn't already exist.
     * @returns A Promise that represents the work queued to execute.
     */
  async load (dialogContext: DialogContext, force = false): Promise<void> {
    const agentState: AgentState = dialogContext.context.turnState.get(this.stateKey)
    if (agentState) {
      await agentState.load(dialogContext.context, force)
    }
  }

  /**
     * Writes the state cache for this AgentState to the storage layer.
     *
     * @param dialogContext The DialogContext object for this turn.
     * @param force Optional, `true` to save the state cache to storage;
     * or `false` to save state to storage only if a property in the cache has changed.
     * @returns A Promise that represents the work queued to execute.
     */
  async saveChanges (dialogContext: DialogContext, force = false): Promise<void> {
    const agentState: AgentState = dialogContext.context.turnState.get(this.stateKey)
    if (agentState) {
      await agentState.saveChanges(dialogContext.context, force)
    }
  }

  /**
     * Deletes any state in storage and the cache for this AgentState.
     *
     * @param _dialogContext The DialogContext object for this turn.
     * @returns A Promise that represents the work queued to execute.
     */
  async delete (_dialogContext: DialogContext): Promise<void> {
    return Promise.resolve()
  }
}
