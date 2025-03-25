/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { Dialog } from './dialog'
import { DialogSet } from './dialogSet'
import { DialogContext } from './dialogContext'
import { DialogEvents } from './dialogEvents'
import { DialogEvent } from './dialogEvent'

/**
 * A container for a set of Dialogs.
 */
export abstract class DialogContainer<O extends object = {}> extends Dialog<O> {
  /**
     * The containers dialog set.
     */
  readonly dialogs = new DialogSet(undefined)

  /**
     * Creates an inner dialog context for the containers active child.
     *
     * @param dialogContext Parents dialog context.
     * @returns A new dialog context for the active child or `undefined` if there is no active child.
     */
  abstract createChildContext (dialogContext: DialogContext): DialogContext | undefined

  /**
     * Finds a child dialog that was previously added to the container.
     *
     * @param dialogId ID of the dialog to lookup.
     * @returns The Dialog if found; otherwise null.
     */
  findDialog (dialogId: string): Dialog | undefined {
    return this.dialogs.find(dialogId)
  }

  /**
     * Called when an event has been raised, using `DialogContext.emitEvent()`,
     * by either the current dialog or a dialog that the current dialog started.
     *
     * @param dialogContext The dialog context for the current turn of conversation.
     * @param event The event being raised.
     * @returns True if the event is handled by the current dialog and bubbling should stop.
     */
  async onDialogEvent (dialogContext: DialogContext, event: DialogEvent): Promise<boolean> {
    const handled = await super.onDialogEvent(dialogContext, event)
    if (!handled && event.name === DialogEvents.versionChanged) {
      const traceMessage = `Unhandled dialog event: ${event.name}. Active Dialog: ${dialogContext.activeDialog.id}`
      await dialogContext.context.sendTraceActivity(traceMessage)
    }
    return handled
  }

  /**
     * Returns internal version identifier for this container.
     *
     * @remarks
     * DialogContainers detect changes of all sub-components in the container and map that to a `versionChanged` event.
     * Because they do this, DialogContainers "hide" the internal changes and just have the .id. This isolates changes
     * to the container level unless a container doesn't handle it.  To support this DialogContainers define a
     * protected method getInternalVersion() which computes if this dialog or child dialogs have changed
     * which is then examined via calls to checkForVersionChange().
     * @returns Version which represents the change of the internals of this container.
     */
  protected getInternalVersion (): string {
    return this.dialogs.getVersion()
  }

  /**
     * Checks to see if a containers child dialogs have changed since the current dialog instance
     * was started.
     *
     * @remarks
     * This should be called at the start of `beginDialog()`, `continueDialog()`, and `resumeDialog()`.
     * @param dialogContext Current dialog context.
     */
  protected async checkForVersionChange (dialogContext: DialogContext): Promise<void> {
    const current = dialogContext.activeDialog.version
    dialogContext.activeDialog.version = this.getInternalVersion()

    // Check for change of previously stored hash
    if (current && current !== dialogContext.activeDialog.version) {
      // Give agent an opportunity to handle the change.
      // - If agent handles it the changeHash will have been updated as to avoid triggering the
      //   change again.
      await dialogContext.emitEvent(DialogEvents.versionChanged, this.id, true, false)
    }
  }
}
