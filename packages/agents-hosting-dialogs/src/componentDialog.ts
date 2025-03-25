/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { TurnContext } from '@microsoft/agents-hosting'
import { Dialog } from './dialog'
import { DialogContext } from './dialogContext'
import { DialogContainer } from './dialogContainer'
import { DialogTurnResult } from './dialogTurnResult'
import { DialogReason } from './dialogReason'
import { DialogInstance } from './dialogInstance'
import { DialogTurnStatus } from './dialogTurnStatus'

const PERSISTED_DIALOG_STATE = 'dialogs'

/**
 * Base class for a dialog that contains other child dialogs.
 *
 * @remarks
 * Component dialogs let you break your agent's logic up into components that can themselves be added
 * as a dialog to another `ComponentDialog` or `DialogSet`. Components can also be exported as part
 * of a node package and used within other agents.
 *
 * @param O (Optional) options that can be passed into the `DialogContext.beginDialog()` method.
 */
export class ComponentDialog<O extends object = {}> extends DialogContainer<O> {
  /**
     * ID of the child dialog that should be started anytime the component is started.
     *
     * @remarks
     * This defaults to the ID of the first child dialog added using [addDialog()](#adddialog).
     */
  protected initialDialogId: string

  /**
     * Called when the dialog is started and pushed onto the parent's dialog stack.
     * By default, this calls the
     * Dialog.BeginDialogAsync(DialogContext, object, CancellationToken) method
     * of the component dialog's initial dialog, as defined by InitialDialogId.
     * Override this method in a derived class to implement interrupt logic.
     *
     * @param outerDialogContext The parent DialogContext for the current turn of conversation.
     * @param options Optional, initial information to pass to the dialog.
     * @returns A Promise representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the dialog is still
     * active after the turn has been processed by the dialog.
     */
  async beginDialog (outerDialogContext: DialogContext, options?: O): Promise<DialogTurnResult> {
    await this.checkForVersionChange(outerDialogContext)

    // Start the inner dialog.
    const innerDC: DialogContext = this.createChildContext(outerDialogContext)
    const turnResult: DialogTurnResult<any> = await this.onBeginDialog(innerDC, options)

    // Check for end of inner dialog
    if (turnResult.status !== DialogTurnStatus.waiting) {
      if (turnResult.status === DialogTurnStatus.cancelled) {
        await this.endComponent(outerDialogContext, turnResult.result)
        const cancelledTurnResult: DialogTurnResult = {
          status: DialogTurnStatus.cancelled,
          result: turnResult.result,
        }
        return cancelledTurnResult
      }
      // Return result to calling dialog
      return await this.endComponent(outerDialogContext, turnResult.result)
    }
    // Just signal end of turn
    return Dialog.EndOfTurn
  }

  /**
     * Called when the dialog is _continued_, where it is the active dialog and the
     * user replies with a new Activity.
     * If this method is *not* overridden, the dialog automatically ends when the user replies.
     *
     * @param outerDialogContext The parent DialogContext for the current turn of conversation.
     * @returns A Promise representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the dialog is still
     * active after the turn has been processed by the dialog. The result may also contain a
     * return value.
     */
  async continueDialog (outerDialogContext: DialogContext): Promise<DialogTurnResult> {
    await this.checkForVersionChange(outerDialogContext)

    // Continue execution of inner dialog.
    const innerDC: DialogContext = this.createChildContext(outerDialogContext)
    const turnResult: DialogTurnResult<any> = await this.onContinueDialog(innerDC)

    // Check for end of inner dialog
    if (turnResult.status !== DialogTurnStatus.waiting) {
      // Return result to calling dialog
      return await this.endComponent(outerDialogContext, turnResult.result)
    }

    // Just signal end of turn
    return Dialog.EndOfTurn
  }

  /**
     * Called when a child dialog on the parent's dialog stack completed this turn, returning
     * control to this dialog component.
     *
     * @param outerDialogContext The DialogContext for the current turn of conversation.
     * @param _reason Reason why the dialog resumed.
     * @param _result Optional, value returned from the dialog that was called. The type
     * of the value returned is dependent on the child dialog.
     * @returns A Promise representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether this dialog is still
     * active after this dialog turn has been processed.
     * Generally, the child dialog was started with a call to
     * beginDialog(DialogContext, object) in the parent's
     * context. However, if the DialogContext.replaceDialog(string, object) method
     * is called, the logical child dialog may be different than the original.
     * If this method is *not* overridden, the dialog automatically calls its
     * RepromptDialog(ITurnContext, DialogInstance) when the user replies.
     */
  async resumeDialog (outerDialogContext: DialogContext, _reason: DialogReason, _result?: any): Promise<DialogTurnResult> {
    await this.checkForVersionChange(outerDialogContext)

    // Containers are typically leaf nodes on the stack but the dev is free to push other dialogs
    // on top of the stack which will result in the container receiving an unexpected call to
    // resumeDialog() when the pushed on dialog ends.
    // To avoid the container prematurely ending we need to implement this method and simply
    // ask our inner dialog stack to re-prompt.
    await this.repromptDialog(outerDialogContext.context, outerDialogContext.activeDialog)

    return Dialog.EndOfTurn
  }

  /**
     * Called when the dialog should re-prompt the user for input.
     *
     * @param context The TurnContext object for this turn.
     * @param instance State information for this dialog.
     * @returns A Promise representing the asynchronous operation.
     */
  async repromptDialog (context: TurnContext, instance: DialogInstance): Promise<void> {
    // Forward to inner dialogs
    const innerDC: DialogContext = this.createInnerDC(context, instance)
    await innerDC.repromptDialog()

    // Notify component.
    await this.onRepromptDialog(context, instance)
  }

  /**
     * Called when the Dialog is ending.
     *
     * @param context The TurnContext object for this turn.
     * @param instance State information associated with the instance of this component Dialog on its parent's dialog stack.
     * @param reason Reason why the Dialog ended.
     * @returns A Promise representing the asynchronous operation.
     * @remarks When this method is called from the parent dialog's context, the component Dialog
     * cancels all of the dialogs on its inner dialog stack before ending.
     */
  async endDialog (context: TurnContext, instance: DialogInstance, reason: DialogReason): Promise<void> {
    // Forward cancel to inner dialogs
    if (reason === DialogReason.cancelCalled) {
      const innerDC: DialogContext = this.createInnerDC(context, instance)
      await innerDC.cancelAllDialogs()
    }

    // Notify component
    await this.onEndDialog(context, instance, reason)
  }

  /**
     * Adds a child Dialog or prompt to the components internal DialogSet.
     *
     * @param dialog The child Dialog or prompt to add.
     * @returns The ComponentDialog after the operation is complete.
     * @remarks
     * The Dialog.id of the first child added to the component will be assigned to the initialDialogId property.
     */
  addDialog (dialog: Dialog): this {
    this.dialogs.add(dialog)
    if (this.initialDialogId === undefined) {
      this.initialDialogId = dialog.id
    }

    return this
  }

  /**
     * Creates the inner dialog context
     *
     * @param outerDialogContext the outer dialog context
     * @returns The created Dialog Context.
     */
  createChildContext (outerDialogContext: DialogContext): DialogContext {
    return this.createInnerDC(outerDialogContext, outerDialogContext.activeDialog)
  }

  /**
     * Called anytime an instance of the component has been started.
     *
     * @remarks
     * SHOULD be overridden by components that wish to perform custom interruption logic. The
     * default implementation calls `innerDC.beginDialog()` with the dialog assigned to
     * initialdialogid.
     * @param innerDialogContext Dialog context for the components internal `DialogSet`.
     * @param options (Optional) options that were passed to the component by its parent.
     * @returns {Promise<DialogTurnResult>} A promise resolving to the dialog turn result.
     */
  protected onBeginDialog (innerDialogContext: DialogContext, options?: O): Promise<DialogTurnResult> {
    return innerDialogContext.beginDialog(this.initialDialogId, options)
  }

  /**
     * Called anytime a multi-turn component receives additional activities.
     *
     * @remarks
     * SHOULD be overridden by components that wish to perform custom interruption logic. The
     * default implementation calls `innerDC.continueDialog()`.
     * @param innerDC Dialog context for the components internal `DialogSet`.
     * @returns {Promise<DialogTurnResult>} A promise resolving to the dialog turn result.
     */
  protected onContinueDialog (innerDC: DialogContext): Promise<DialogTurnResult> {
    return innerDC.continueDialog()
  }

  /**
     * Called when the component is ending.
     *
     * @remarks
     * If the `reason` code is equal to `DialogReason.cancelCalled`, then any active child dialogs
     * will be cancelled before this method is called.
     * @param _context Context for the current turn of conversation.
     * @param _instance The components instance data within its parents dialog stack.
     * @param _reason The reason the component is ending.
     * @returns A promise representing the asynchronous operation.
     */
  protected onEndDialog (_context: TurnContext, _instance: DialogInstance, _reason: DialogReason): Promise<void> {
    return Promise.resolve()
  }

  /**
     * Called when the component has been requested to re-prompt the user for input.
     *
     * @remarks
     * The active child dialog will have already been asked to reprompt before this method is called.
     * @param _context Context for the current turn of conversation.
     * @param _instance The instance of the current dialog.
     * @returns A promise representing the asynchronous operation.
     */
  protected onRepromptDialog (_context: TurnContext, _instance: DialogInstance): Promise<void> {
    return Promise.resolve()
  }

  /**
     * Called when the components last active child dialog ends and the component is ending.
     *
     * @remarks
     * SHOULD be overridden by components that wish to perform custom logic before the component
     * ends.  The default implementation calls `outerDC.endDialog()` with the `result` returned
     * from the last active child dialog.
     * @param outerDC Dialog context for the parents `DialogSet`.
     * @param result Result returned by the last active child dialog. Can be a value of `undefined`.
     * @returns {Promise<DialogTurnResult>} A promise resolving to the dialog turn result.
     */
  protected endComponent (outerDC: DialogContext, result: any): Promise<DialogTurnResult> {
    return outerDC.endDialog(result)
  }

  /**
     * @private
     * @param context DialogContext for the current turn of conversation with the user.
     * @param instance DialogInstance which contains the current state information for this dialog.
     * @returns A new DialogContext instance.
     * @remarks
     * You should only call this if you don't have a dialogContext to work with (such as OnResume())
     */
  private createInnerDC (context: DialogContext, instance: DialogInstance): DialogContext
  /**
     * @private
     * @param context TurnContext for the current turn of conversation with the user.
     * @param instance DialogInstance which contains the current state information for this dialog.
     * @returns A new DialogContext instance.
     * @remarks
     * You should only call this if you don't have a dc to work with (such as OnResume())
     */
  private createInnerDC (context: TurnContext, instance: DialogInstance): DialogContext
  /**
     * @private
     * @param context TurnContext or DialogContext for the current turn of conversation with the user.
     * @param instance DialogInstance which contains the current state information for this dialog.
     * @returns A new DialogContext instance.
     * @remarks
     * You should only call this if you don't have a dc to work with (such as OnResume())
     */
  private createInnerDC (context: TurnContext | DialogContext, instance: DialogInstance): DialogContext {
    if (!instance) {
      const dialogInstance = { state: {} }
      instance = dialogInstance as DialogInstance
    }

    const dialogState = instance.state[PERSISTED_DIALOG_STATE] || { dialogStack: [] }
    instance.state[PERSISTED_DIALOG_STATE] = dialogState

    return new DialogContext(this.dialogs, context as TurnContext, dialogState)
  }
}
