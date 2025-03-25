/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { TurnContext } from '@microsoft/agents-hosting'
import { DialogContext } from './dialogContext'
import { Configurable } from './configurable'
import { DialogTurnResult } from './dialogTurnResult'
import { DialogEvent } from './dialogEvent'
import { DialogReason } from './dialogReason'
import { DialogInstance } from './dialogInstance'
import { DialogTurnStatus } from './dialogTurnStatus'

/**
 * Defines the core behavior for all dialogs.
 */
export abstract class Dialog<O extends object = {}> extends Configurable {
  private _id: string

  /**
     * Gets a default end-of-turn result.
     *
     * @remarks
     * This result indicates that a dialog (or a logical step within a dialog) has completed
     * processing for the current turn, is still active, and is waiting for more input.
     */
  static EndOfTurn: DialogTurnResult = { status: DialogTurnStatus.waiting }

  /**
     * Creates a new instance of the Dialog class.
     *
     * @param dialogId Optional. unique ID of the dialog.
     */
  constructor (dialogId?: string) {
    super()
    this.id = dialogId
  }

  /**
     * Unique ID of the dialog.
     *
     * @remarks
     * This will be automatically generated if not specified.
     * @returns The Id for the dialog.
     */
  get id (): string {
    if (this._id === undefined) {
      this._id = this.onComputeId()
    }
    return this._id
  }

  /**
     * Sets the unique ID of the dialog.
     */
  set id (value: string) {
    this._id = value
  }

  /**
     * An encoded string used to aid in the detection of agent changes on re-deployment.
     *
     * @remarks
     * This defaults to returning the dialogs [id](#id) but can be overridden to provide more
     * precise change detection logic. Any dialog on the stack that has its version change will
     * result in a `versionChanged` event will be raised. If this event is not handled by the agent,
     * an error will be thrown resulting in the agent error handler logic being run.
     *
     * Returning an empty string will disable version tracking for the component all together.
     * @returns Unique string which should only change when dialog has changed in a way that should restart the dialog.
     */
  getVersion (): string {
    return this.id
  }

  /**
     * When overridden in a derived class, starts the dialog.
     *
     * @param dc The context for the current dialog turn.
     * @param options Optional. Arguments to use when the dialog starts.
     *
     * @remarks
     * Derived dialogs must override this method.
     *
     * The DialogContext calls this method when it creates
     * a new DialogInstance for this dialog, pushes it
     * onto the dialog stack, and starts the dialog.
     *
     * A dialog that represents a single-turn conversation should await
     * DialogContext.endDialog before exiting this method.
     *
     */
  abstract beginDialog (dc: DialogContext, options?: O): Promise<DialogTurnResult>

  /**
     * When overridden in a derived class, continues the dialog.
     *
     * @param dc The context for the current dialog turn.
     *
     * @remarks
     * Derived dialogs that support multiple-turn conversations should override this method.
     * By default, this method signals that the dialog is complete and returns.
     *
     * The DialogContext calls this method when it continues
     * the dialog.
     *
     * To signal to the dialog context that this dialog has completed, await
     * DialogContext.endDialog before exiting this method.
     *
     * @returns {Promise<DialogTurnResult>} A promise resolving to the dialog turn result.
     */
  async continueDialog (dc: DialogContext): Promise<DialogTurnResult> {
    // By default just end the current dialog.
    return dc.endDialog()
  }

  /**
     * When overridden in a derived class, resumes the dialog after the dialog above it on the stack completes.
     *
     * @param dc The context for the current dialog turn.
     * @param reason The reason the dialog is resuming. This will typically be DialogReason.endCalled
     * @param result Optional. The return value, if any, from the dialog that ended.
     *
     * @remarks
     * Derived dialogs that support multiple-turn conversations should override this method.
     * By default, this method signals that the dialog is complete and returns.
     *
     * The DialogContext calls this method when it resumes
     * the dialog. If the previous dialog on the stack returned a value, that value is in the `result`
     * parameter.
     *
     * To start a _child_ dialog, use DialogContext.beginDialog or DialogContext.prompt; however, this dialog will not
     * necessarily be the one that started the child dialog.
     * To signal to the dialog context that this dialog has completed, await DialogContext.endDialog before exiting this method.
     *
     * @returns {Promise<DialogTurnResult>} A promise resolving to the dialog turn result.
     */
  async resumeDialog (dc: DialogContext, reason: DialogReason, result?: any): Promise<DialogTurnResult> {
    // By default just end the current dialog and return result to parent.
    return dc.endDialog(result)
  }

  /**
     * When overridden in a derived class, reprompts the user for input.
     *
     * @param _context The context object for the turn.
     * @param _instance Current state information for this dialog.
     *
     * @remarks
     * Derived dialogs that support validation and re-prompt logic should override this method.
     * By default, this method has no effect.
     *
     * The DialogContext calls this method when the current
     * dialog should re-request input from the user. This method is implemented for prompt dialogs.
     *
     */
  async repromptDialog (_context: TurnContext, _instance: DialogInstance): Promise<void> {
    // No-op by default
  }

  /**
     * When overridden in a derived class, performs clean up for the dialog before it ends.
     *
     * @param _context The context object for the turn.
     * @param _instance Current state information for this dialog.
     * @param _reason The reason the dialog is ending.
     *
     * @remarks
     * Derived dialogs that need to perform logging or cleanup before ending should override this method.
     * By default, this method has no effect.
     *
     * The DialogContext calls this method when the current
     * dialog is ending.
     *
     */
  async endDialog (_context: TurnContext, _instance: DialogInstance, _reason: DialogReason): Promise<void> {
    // No-op by default
  }

  /**
     * Called when an event has been raised, using `DialogContext.emitEvent()`, by either the current dialog or a dialog that the current dialog started.
     *
     * @param dialogContext - The dialog context for the current turn of conversation.
     * @param event - The event being raised.
     * @returns True if the event is handled by the current dialog and bubbling should stop.
     */
  async onDialogEvent (dialogContext: DialogContext, event: DialogEvent): Promise<boolean> {
    // Before bubble
    let handled = await this.onPreBubbleEvent(dialogContext, event)

    // Bubble as needed
    if (!handled && event.bubble && dialogContext.parent !== undefined) {
      handled = await dialogContext.parent.emitEvent(event.name, event.value, true, false)
    }

    // Post bubble
    if (!handled) {
      handled = await this.onPostBubbleEvent(dialogContext, event)
    }

    return handled
  }

  /**
     * Called before an event is bubbled to its parent.
     *
     * @remarks
     * This is a good place to perform interception of an event as returning `true` will prevent
     * any further bubbling of the event to the dialogs parents and will also prevent any child
     * dialogs from performing their default processing.
     * @param _dc The dialog context for the current turn of conversation.
     * @param _e The event being raised.
     * @returns Whether the event is handled by the current dialog and further processing should stop.
     */
  protected async onPreBubbleEvent (_dc: DialogContext, _e: DialogEvent): Promise<boolean> {
    return false
  }

  /**
     * Called after an event was bubbled to all parents and wasn't handled.
     *
     * @remarks
     * This is a good place to perform default processing logic for an event. Returning `true` will
     * prevent any processing of the event by child dialogs.
     * @param _dc The dialog context for the current turn of conversation.
     * @param _e The event being raised.
     * @returns Whether the event is handled by the current dialog and further processing should stop.
     */
  protected async onPostBubbleEvent (_dc: DialogContext, _e: DialogEvent): Promise<boolean> {
    return false
  }

  /**
     * Called when a unique ID needs to be computed for a dialog.
     *
     * @remarks
     * SHOULD be overridden to provide a more contextually relevant ID. The preferred pattern for
     * ID's is `<dialog type>(this.hashedLabel('<dialog args>'))`.
     */
  protected onComputeId (): string {
    throw new Error('Dialog.onComputeId(): not implemented.')
  }
}
