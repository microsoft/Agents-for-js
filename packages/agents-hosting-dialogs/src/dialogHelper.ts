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
import { DialogEvents } from './dialogEvents'
import { DialogSet } from './dialogSet'
import { DialogStateManager, DialogStateManagerConfiguration } from './memory'
import { DialogTurnResult } from './dialogTurnResult'
import { DialogTurnStatus } from './dialogTurnStatus'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

/**
 * Runs a dialog from a given context and accessor.
 *
 * @param dialog The Dialog to run.
 * @param context TurnContext object for the current turn of conversation with the user.
 * @param accessor Defined methods for accessing the state property created in a State object.
 */
export async function runDialog (
  dialog: Dialog,
  context: TurnContext,
  accessor: AgentStatePropertyAccessor<DialogState>
): Promise<void> {
  if (!dialog) {
    throw new Error('runDialog(): missing dialog')
  }

  if (!context) {
    throw new Error('runDialog(): missing context')
  }

  if (!context.activity) {
    throw new Error('runDialog(): missing context.activity')
  }

  if (!accessor) {
    throw new Error('runDialog(): missing accessor')
  }

  const dialogSet = new DialogSet(accessor)
  dialogSet.add(dialog)

  const dialogContext = await dialogSet.createContext(context)

  await internalRun(context, dialog.id, dialogContext)
}

/**
 * @param context The TurnContext for the turn.
 * @param dialogId The dialog ID.
 * @param dialogContext The DialogContext for the current turn of conversation.
 * @param dialogStateManagerConfiguration Configuration for the dialog state manager.
 * @returns {Promise<DialogTurnResult>} a promise resolving to the dialog turn result.
 */
export async function internalRun (
  context: TurnContext,
  dialogId: string,
  dialogContext: DialogContext,
  dialogStateManagerConfiguration?: DialogStateManagerConfiguration
): Promise<DialogTurnResult> {
  // map TurnState into root dialog context.services
  context.turnState.forEach((service, key) => {
    dialogContext.services.push(key, service)
  })

  const dialogStateManager = new DialogStateManager(dialogContext, dialogStateManagerConfiguration)

  await dialogStateManager.loadAllScopes()
  dialogContext.context.turnState.push('DialogStateManager', dialogStateManager)
  let dialogTurnResult: DialogTurnResult = null

  // Loop as long as we are getting valid OnError handled we should continue executing the actions for the turn.
  // NOTE: We loop around this block because each pass through we either complete the turn and break out of the loop
  // or we have had an exception AND there was an OnError action which captured the error. We need to continue the
  // turn based on the actions the OnError handler introduced.
  let endOfTurn = false
  while (!endOfTurn) {
    try {
      dialogTurnResult = await innerRun(context, dialogId, dialogContext)

      // turn successfully completed, break the loop
      endOfTurn = true
    } catch (err) {
      // fire error event, bubbling from the leaf.
      const handled = await dialogContext.emitEvent(DialogEvents.error, err, true, true)

      if (!handled) {
        // error was NOT handled, throw the exception and end the turn.
        // (This will trigger the Adapter.OnError handler and end the entire dialog stack)
        throw err
      }
    }
  }

  // save all state scopes to their respective agentState locations.
  await dialogStateManager.saveAllChanges()

  // return the redundant result because the DialogManager contract expects it
  return dialogTurnResult
}

async function innerRun (
  context: TurnContext,
  dialogId: string,
  dialogContext: DialogContext
): Promise<DialogTurnResult> {
  // Continue or start the dialog.
  let result = await dialogContext.continueDialog()
  if (result.status === DialogTurnStatus.empty) {
    result = await dialogContext.beginDialog(dialogId)
  }

  await sendStateSnapshotTrace(dialogContext)

  return result
}

/**
 * Recursively walk up the dialog context stack to find the active DC.
 *
 * @param dialogContext DialogContext for the current turn of conversation with the user.
 * @returns Active DialogContext.
 */
export function getActiveDialogContext (dialogContext: DialogContext): DialogContext {
  const child = dialogContext.child
  if (!child) {
    return dialogContext
  }

  return getActiveDialogContext(child)
}

// Helper to send a trace activity with a memory snapshot of the active dialog DC.
const sendStateSnapshotTrace = async (dialogContext: DialogContext): Promise<void> => {
  const traceLabel = 'Agent State'

  // Send trace of memory
  const snapshot = getActiveDialogContext(dialogContext).state.getMemorySnapshot()
  const traceActivity = new Activity(ActivityTypes.Trace)
  traceActivity.name = 'AgentState'
  traceActivity.label = 'https://www.botframework.com/schemas/botState'
  traceActivity.value = snapshot
  traceActivity.label = traceLabel

  await dialogContext.context.sendActivity(traceActivity)
}
