/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import {
  AgentStatePropertyAccessor,
  TurnContext
} from '@microsoft/agents-hosting'

import { Dialog } from './dialog'
import { DialogContext, DialogState } from './dialogContext'
import { StringUtils } from './stringUtils'

/**
 * Interface for dialogs that have child dialog dependencies.
 *
 * @remarks
 * Implement this interface on dialog classes that need to register child dialogs
 * with their parent dialog set. When a dialog implementing this interface is added
 * to a DialogSet, the DialogSet will automatically call getDependencies() and add
 * all returned child dialogs to itself, ensuring proper dialog registration and
 * avoiding runtime errors when the dialog tries to call child dialogs.
 *
 * This is particularly useful for complex dialogs that compose multiple sub-dialogs
 * or for dialog libraries that need to ensure their dependencies are available.
 *
 * @example
 * ```typescript
 * class MyComplexDialog extends Dialog implements DialogDependencies {
 *   private textPrompt = new TextPrompt('textPrompt');
 *   private confirmPrompt = new ConfirmPrompt('confirmPrompt');
 *
 *   getDependencies(): Dialog[] {
 *     return [this.textPrompt, this.confirmPrompt];
 *   }
 * }
 * ```
 */
export interface DialogDependencies {
  /**
   * Returns an array of child dialogs that this dialog depends on.
   *
   *
   * @remarks
   * This method is called automatically by DialogSet.add() when a dialog implementing
   * this interface is added to the set. All returned dialogs will be recursively
   * added to the same DialogSet, ensuring they are available when needed during
   * dialog execution.
   *
   * The returned dialogs should be the actual Dialog instances that will be called
   * by this dialog, not new instances. This ensures proper dialog lifecycle management
   * and state consistency.
   *
   * @returns An array of Dialog instances that should be added to the parent DialogSet.
   */
  getDependencies(): Dialog[];
}

/**
 * A related set of dialogs that can all call each other.
 *
 * @remarks
 * The constructor for the dialog set should be passed a state property that will be used to
 * persist the dialog stack for the set:
 *
 * To interact with the sets dialogs you can call `createcontext` with the
 * current {@link @microsoft/agents-hosting.TurnContext}. That will create a {@link DialogContext} that can be used to start or continue
 * execution of the sets dialogs:
 *
 */
export class DialogSet {
  private readonly dialogs: { [id: string]: Dialog } = {}
  private readonly dialogState: AgentStatePropertyAccessor<DialogState>
  private _version: string

  /**
     * Creates a new DialogSet instance.
     *
     * @remarks
     * If the `dialogState` parameter is not passed in, calls to `createContext`
     * will return an error.  You will need to create a {@link DialogContext} for the set manually and
     * pass in your own state object for persisting the sets dialog stack:
     *
     * @param dialogState (Optional) state property used to persist the sets dialog stack.
     */
  constructor (dialogState?: AgentStatePropertyAccessor<DialogState>) {
    this.dialogState = dialogState
  }

  /**
     * Returns a 32-bit hash of the all the `Dialog.version` values in the set.
     *
     * @returns A version that will change when any of the child dialogs version changes.
     * @remarks
     * This hash is persisted to state storage and used to detect changes to a dialog set.
     */
  getVersion (): string {
    if (!this._version) {
      let versions = ''
      for (const id in this.dialogs) {
        const v = this.dialogs[id].getVersion()
        if (v) {
          versions += `|${v}`
        }
      }
      this._version = StringUtils.hash(versions)
    }

    return this._version
  }

  /**
     * Adds a new dialog or prompt to the set.
     *
     * @remarks
     * If the {@link Dialog.id} being added already exists in the set, the dialogs id will be updated to
     * include a suffix which makes it unique. So adding 2 dialogs named "duplicate" to the set
     * would result in the first one having an id of "duplicate" and the second one having an id
     * of "duplicate2".
     * @param dialog The dialog or prompt to add.
     * If a telemetryClient is present on the dialog set, it will be added to each dialog.
     * @returns The dialog set after the operation is complete.
     */
  add<T extends Dialog>(dialog: T): this {
    if (!(dialog instanceof Dialog)) {
      throw new Error('DialogSet.add(): Invalid dialog being added.')
    }

    // Ensure new version hash is computed
    this._version = undefined

    // Ensure dialogs ID is unique.
    if (Object.prototype.hasOwnProperty.call(this.dialogs, dialog.id)) {
      // If we are trying to add the same exact instance, it's not a name collision.
      // No operation required since the instance is already in the dialog set.
      if (this.dialogs[dialog.id] === dialog) {
        return this
      }

      // If we are adding a new dialog with a conflicting name, add a suffix to avoid
      // dialog name collisions.
      let nextSuffix = 2

      while (true) {
        const suffixId = dialog.id + nextSuffix.toString()
        if (!Object.prototype.hasOwnProperty.call(this.dialogs, suffixId)) {
          dialog.id = suffixId
          break
        } else {
          nextSuffix++
        }
      }
    }

    // Save dialog reference
    this.dialogs[dialog.id] = dialog

    // Automatically add any child dependencies the dialog might have
    if (typeof (dialog as any as DialogDependencies).getDependencies === 'function') {
      (dialog as any as DialogDependencies).getDependencies().forEach((child: Dialog): void => {
        this.add(child)
      })
    }

    return this
  }

  /**
     * Creates a dialog context which can be used to work with the dialogs in the set.
     *
     * @param context Context for the current turn of conversation with the user.
     * @returns A promise representing the asynchronous operation.
     */
  async createContext (context: TurnContext): Promise<DialogContext> {
    if (!this.dialogState) {
      throw new Error(
        'DialogSet.createContext(): the dialog set was not bound to a stateProperty when constructed.'
      )
    }
    const state: DialogState = await this.dialogState.get(context, { dialogStack: [] } as DialogState)

    return new DialogContext(this, context, state)
  }

  /**
     * Finds a dialog that was previously added to the set using add.
     * @param dialogId ID of the dialog or prompt to lookup.
     * @returns The dialog if found; otherwise undefined.
     */
  find (dialogId: string): Dialog | undefined {
    return Object.prototype.hasOwnProperty.call(this.dialogs, dialogId) ? this.dialogs[dialogId] : undefined
  }

  /**
     * Gets the Dialogs of the set.
     *
     * @returns {Dialog} An array of Dialog.
     */
  getDialogs (): Dialog[] {
    return Object.values(this.dialogs)
  }
}
