/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'
import { DialogContainer } from '../../dialogContainer'

/**
 * A memory scope that provides access to the active dialog's state.
 * This scope binds to the active dialog if it is a container, or to its parent dialog if applicable.
 */
export class DialogMemoryScope extends MemoryScope {
  /**
   * Initializes a new instance of the DialogMemoryScope class.
   */
  constructor () {
    super(ScopePath.dialog)
  }

  /**
   * Gets the backing memory for this scope.
   *
   * @param dialogContext - The DialogContext object for this turn.
   * @returns The memory for the scope.
   */
  getMemory (dialogContext: DialogContext): object {
    // If active dialog is a container dialog then "dialog" binds to it.
    // Otherwise the "dialog" will bind to the dialogs parent assuming it
    // is a container.
    let parent: DialogContext = dialogContext
    if (!this.isContainer(parent) && parent.parent && this.isContainer(parent.parent)) {
      parent = parent.parent
    }

    // If there's no active dialog then return undefined.
    return parent.activeDialog ? parent.activeDialog.state : {}
  }

  /**
   * Changes the backing object for the memory scope.
   *
   * @param dialogContext - The DialogContext object for this turn.
   * @param memory - Memory object to set for the scope.
   * @throws Will throw an error if the memory object is undefined or if no active dialog is found.
   */
  setMemory (dialogContext: DialogContext, memory: object): void {
    if (memory === undefined) {
      throw ExceptionHelper.generateException(
        Error,
        Errors.UndefinedMemoryObject,
        undefined,
        { scopeName: 'DialogMemoryScope' }
      )
    }

    // If active dialog is a container dialog then "dialog" binds to it.
    // Otherwise the "dialog" will bind to the dialogs parent assuming it
    // is a container.
    let parent: DialogContext = dialogContext
    if (!this.isContainer(parent) && parent.parent && this.isContainer(parent.parent)) {
      parent = parent.parent
    }

    // If there's no active dialog then throw an error.
    if (!parent.activeDialog) {
      throw ExceptionHelper.generateException(
        Error,
        Errors.ActiveDialogUndefined
      )
    }

    parent.activeDialog.state = memory
  }

  /**
   * Determines if the given dialog context is a container.
   *
   * @private
   * @param dialogContext - The DialogContext object for this turn.
   * @returns A boolean indicating whether the dialog context is a container.
   */
  private isContainer (dialogContext: DialogContext): boolean {
    if (dialogContext !== undefined && dialogContext.activeDialog !== undefined) {
      const dialog = dialogContext.findDialog(dialogContext.activeDialog.id)
      if (dialog instanceof DialogContainer) {
        return true
      }
    }

    return false
  }
}
