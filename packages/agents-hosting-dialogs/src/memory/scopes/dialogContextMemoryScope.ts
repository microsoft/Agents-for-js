/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { DialogContext } from '../../dialogContext'
import { MemoryScope } from './memoryScope'
import { ScopePath } from '../scopePath'

/**
 * A memory scope that provides access to the dialog context.
 * This scope includes information about the active dialog, its parent, and the dialog stack.
 */
export class DialogContextMemoryScope extends MemoryScope {
  /**
   * Initializes a new instance of the `DialogContextMemoryScope` class.
   */
  constructor () {
    super(ScopePath.dialogContext, false)
  }

  /**
   * Gets the backing memory for this scope.
   * @param dialogContext - The `DialogContext` object for this turn.
   * @returns An object containing the dialog stack, active dialog ID, and parent dialog ID.
   */
  getMemory (dialogContext: DialogContext): Record<'stack' | 'activeDialog' | 'parent', unknown> {
    const stack = []
    let currentDialogContext: DialogContext | undefined = dialogContext

    // go to leaf node
    while (currentDialogContext.child) {
      currentDialogContext = currentDialogContext.child
    }

    while (currentDialogContext) {
      for (let i = currentDialogContext.stack.length - 1; i >= 0; i--) {
        const item = currentDialogContext.stack[i]
        // filter out ActionScope items because they are internal bookkeeping.
        if (!item.id.startsWith('ActionScope[')) {
          stack.push(item.id)
        }
      }

      currentDialogContext = currentDialogContext.parent
    }

    return {
      stack,
      activeDialog: dialogContext.activeDialog && dialogContext.activeDialog.id,
      parent: dialogContext.parent && dialogContext.parent.activeDialog && dialogContext.parent.activeDialog.id,
    }
  }
}
