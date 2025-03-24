/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { MemoryScope } from './memoryScope'
import { ScopePath } from '../scopePath'
import { DialogContext } from '../../dialogContext'
import { Dialog } from '../../dialog'

export class ClassMemoryScope extends MemoryScope {
  /**
     * Initializes a new instance of the ClassMemoryScope class.
     *
     * @param name Name of the scope class.
     */
  constructor (name = ScopePath.class) {
    super(name, false)
  }

  /**
     * Gets the backing memory for this scope.
     *
     * @param dialogContext The DialogContext object for this turn.
     * @returns The memory for the scope.
     */
  getMemory (dialogContext: DialogContext): object {
    // if active dialog is a container dialog then "dialog" binds to it
    if (dialogContext.activeDialog) {
      const dialog = this.onFindDialog(dialogContext)
      if (dialog !== undefined) {
        // Clone properties
        const clone: object = {}
        for (const key in dialog) {
          const prop = dialog[key]
          if (Object.prototype.hasOwnProperty.call(dialog, key) && typeof prop !== 'function') {
            if (isExpression(prop)) {
              const { value, error } = prop.tryGetValue(dialogContext.state)
              if (!error) {
                clone[key] = value
              }
            } else {
              clone[key] = prop
            }
          }
        }

        return clone
      }
    }

    return {}
  }

  /**
     * Override to find the dialog instance referenced by the scope.
     *
     * @param dialogContext Current dialog context.
     * @returns The dialog instance referenced by the scope.
     */
  protected onFindDialog (dialogContext: DialogContext): Dialog | undefined {
    return dialogContext.findDialog(dialogContext.activeDialog.id)
  }
}

function isExpression (prop: any): prop is ExpressionResolver {
  return typeof prop === 'object' && typeof prop['tryGetValue'] === 'function'
}

interface ExpressionResolver {
  tryGetValue(data: object): { value: any; error: Error };
}
