/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'

export class ThisMemoryScope extends MemoryScope {
  /**
     * Initializes a new instance of the ThisMemoryScope class.
     */
  constructor () {
    super(ScopePath.this)
  }

  /**
     * Gets the backing memory for this scope.
     *
     * @param dialogContext The DialogContext object for this turn.
     * @returns The memory for the scope.
     */
  getMemory (dialogContext: DialogContext): object {
    return dialogContext.activeDialog ? dialogContext.activeDialog.state : {}
  }

  /**
     * Changes the backing object for the memory scope.
     *
     * @param dialogContext The DialogContext object for this turn.
     * @param memory Memory object to set for the scope.
     */
  setMemory (dialogContext: DialogContext, memory: object): void {
    if (memory === undefined) {
      throw new Error('ThisMemoryScope.setMemory: undefined memory object passed in.')
    }

    if (!dialogContext.activeDialog) {
      throw new Error('ThisMemoryScope.setMemory: no active dialog found.')
    }

    dialogContext.activeDialog.state = memory
  }
}
