/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DialogContext } from '../../dialogContext'

/**
 * Abstract base class for all memory scopes.
 */
export abstract class MemoryScope {
  /**
     * Initializes a new instance of the MemoryScope class.
     *
     * @param name Name of the scope.
     * @param includeInSnapshot Boolean value indicating whether this memory
     * should be included in snapshot. Default value is true.
     */
  constructor (name: string, includeInSnapshot = true) {
    this.includeInSnapshot = includeInSnapshot
    this.name = name
  }

  readonly name: string
  readonly includeInSnapshot: boolean

  /**
     * Get the backing memory for this scope
     *
     * @param dialogContext Current dialog context.
     * @returns memory for the scope
     */
  abstract getMemory (dialogContext: DialogContext): object

  /**
     * Changes the backing object for the memory scope.
     *
     * @param _dialogContext Current dialog context
     * @param _memory memory to assign
     */
  setMemory (_dialogContext: DialogContext, _memory: object): void {
    throw new Error(`MemoryScope.setMemory: The '${this.name}' memory scope is read-only.`)
  }

  /**
     * Loads a scopes backing memory at the start of a turn.
     *
     * @param _dialogContext Current dialog context.
     */
  async load (_dialogContext: DialogContext): Promise<void> {
    // No initialization by default.
  }

  /**
     * Saves a scopes backing memory at the end of a turn.
     *
     * @param _dialogContext Current dialog context.
     */
  async saveChanges (_dialogContext: DialogContext): Promise<void> {
    // No initialization by default.
  }

  /**
     * Deletes the backing memory for a scope.
     *
     * @param _dialogContext Current dialog context.
     */
  async delete (_dialogContext: DialogContext): Promise<void> {
    throw new Error(`MemoryScope.delete: The '${this.name}' memory scope can't be deleted.`)
  }
}
