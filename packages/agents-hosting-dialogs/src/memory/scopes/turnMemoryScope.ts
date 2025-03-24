/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'

/**
 * @private
 */
const TURN_STATE = 'turn'

/**
 * TurnMemoryScope represents memory scoped to the current turn.
 */
export class TurnMemoryScope extends MemoryScope {
  /**
     * Initializes a new instance of the TurnMemoryScope class.
     */
  constructor () {
    super(ScopePath.turn, true)
  }

  /**
     * Get the backing memory for this scope.
     *
     * @param dialogContext The DialogContext for this turn.
     * @returns The memory for the scope.
     */
  getMemory (dialogContext: DialogContext): object {
    let memory = dialogContext.context.turnState.get(TURN_STATE)
    if (typeof memory !== 'object') {
      memory = {}
      dialogContext.context.turnState.set(TURN_STATE, memory)
    }

    return memory
  }

  /**
     * Changes the backing object for the memory scope.
     *
     * @param dialogContext The DialogContext for this turn.
     * @param memory Memory object to set for the scope.
     */
  setMemory (dialogContext: DialogContext, memory: object): void {
    if (memory === undefined) {
      throw new Error('TurnMemoryScope.setMemory: undefined memory object passed in.')
    }

    dialogContext.context.turnState.set(TURN_STATE, memory)
  }
}
