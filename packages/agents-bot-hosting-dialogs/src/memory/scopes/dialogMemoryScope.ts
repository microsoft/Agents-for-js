/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'
import { DialogContainer } from '../../dialogContainer'

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
     * @param dialogContext The DialogContext object for this turn.
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
     * @param dialogContext The DialogContext object for this turn.
     * @param memory Memory object to set for the scope.
     */
  setMemory (dialogContext: DialogContext, memory: object): void {
    if (memory === undefined) {
      throw new Error('DialogMemoryScope.setMemory: undefined memory object passed in.')
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
      throw new Error('DialogMemoryScope.setMemory: no active dialog found.')
    }

    parent.activeDialog.state = memory
  }

  /**
     * @private
     * @param dialogContext The DialogContext object for this turn.
     * @returns A boolean indicating whether is a cointainer or not.
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
