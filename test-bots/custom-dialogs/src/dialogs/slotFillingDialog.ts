// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-bot-hosting'
import { Dialog, DialogContext, DialogReason } from '@microsoft/agents-bot-hosting-dialogs'
import { SlotDetails } from './slotDetails'

const SlotName = 'slot'
const PersistedValues = 'values'

export class SlotFillingDialog extends Dialog {
  constructor (public dialogId: string, public slots: SlotDetails[]) {
    super(dialogId)
    this.slots = slots
  }

  async beginDialog (dialogContext:DialogContext) {
    if (dialogContext.context.activity.type !== ActivityTypes.Message) {
      return Dialog.EndOfTurn
    }

    // Initialize a spot to store these values.
    if (dialogContext.activeDialog) {
      dialogContext.activeDialog.state[PersistedValues] = {}
    }

    // Call runPrompt, which will find the next slot to fill.
    return await this.runPrompt(dialogContext)
  }

  async continueDialog (dialogContext: DialogContext) {
    // Skip non-message activities.
    if (dialogContext.context.activity.type !== ActivityTypes.Message) {
      return Dialog.EndOfTurn
    }

    // Call runPrompt, which will find the next slot to fill.
    return await this.runPrompt(dialogContext)
  }

  async resumeDialog (dialogContext: DialogContext, reason: DialogReason, result?: any) {
    // dialogResume is called whenever a prompt or child-dialog completes
    // and the parent dialog resumes.  Since every turn of a SlotFillingDialog
    // is a prompt, we know that whenever we resume, there is a value to capture.

    // The slotName of the slot that was just filled was been stored in the state.
    const slotName = dialogContext.activeDialog?.state[SlotName]

    // Get the previously persisted values.
    const values = dialogContext.activeDialog?.state[PersistedValues]

    // Set the new value into the appropriate slot name.
    values[slotName] = result

    // Move on to the next slot in the dialog.
    return await this.runPrompt(dialogContext)
  }

  async runPrompt (dialogContext: DialogContext) {
    // runPrompt finds the next slot to fill, then calls the appropriate prompt to fill it.
    const state = dialogContext.activeDialog?.state
    const values = state[PersistedValues]

    // Find unfilled slots by filtering the full list of slots, excluding those for which we already have a value.
    const unfilledSlot = this.slots.filter(function (slot: SlotDetails) { return !Object.keys(values).includes(slot.name) })

    // If there are unfilled slots still left, prompt for the next one.
    if (unfilledSlot.length) {
      state[SlotName] = unfilledSlot[0].name
      return await dialogContext.prompt(unfilledSlot[0].promptId, unfilledSlot[0].options)
    } else {
      // If all the prompts are filled, we're done. Return the full state object,
      // which will now contain values for all the slots.
      return await dialogContext.endDialog(dialogContext.activeDialog?.state)
    }
  }
}
