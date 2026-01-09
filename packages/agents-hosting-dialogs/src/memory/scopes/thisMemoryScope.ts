/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'
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
      throw ExceptionHelper.generateException(
        Error,
        Errors.UndefinedMemoryObject,
        undefined,
        { scopeName: 'ThisMemoryScope' }
      )
    }

    if (!dialogContext.activeDialog) {
      throw ExceptionHelper.generateException(
        Error,
        Errors.ActiveDialogUndefined
      )
    }

    dialogContext.activeDialog.state = memory
  }
}
