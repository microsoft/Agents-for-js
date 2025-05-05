/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { ClassMemoryScope } from './classMemoryScope'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'
import { Dialog } from '../../dialog'
import { DialogContainer } from '../../dialogContainer'

/**
 * A memory scope that provides access to the properties of the active dialog class.
 * This scope resolves to the active dialog if it is a container, or to its parent dialog.
 */
export class DialogClassMemoryScope extends ClassMemoryScope {
  /**
   * Initializes a new instance of the DialogClassMemoryScope class.
   */
  constructor () {
    super(ScopePath.dialogClass)
  }

  /**
   * @protected
   * Finds the dialog instance referenced by the scope.
   *
   * @param dialogContext - The DialogContext object for this turn.
   * @returns The current dialog, or its parent dialog if applicable.
   */
  protected onFindDialog (dialogContext: DialogContext): Dialog | undefined {
    // Is the active dialog a container?
    const dialog = dialogContext.findDialog(dialogContext.activeDialog.id)
    if (dialog && dialog instanceof DialogContainer) {
      return dialog
    }

    // Return parent dialog if there is one?
    const parent = dialogContext.parent
    if (parent && parent.activeDialog) {
      const parentDialog = parent.findDialog(parent.activeDialog.id)
      if (parentDialog) {
        return parentDialog
      }
    }

    // Fallback to returning current dialog
    return dialog
  }
}
