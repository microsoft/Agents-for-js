/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { v4 as uuidv4 } from 'uuid'
import { ActivityTypes } from '@microsoft/agents-activity'
import { Dialog } from './dialog'
import { DialogContext } from './dialogContext'
import { WaterfallStepContext } from './waterfallStepContext'
import { DialogTurnResult } from './dialogTurnResult'
import { DialogReason } from './dialogReason'

/**
 * Function signature of an individual waterfall step.
 *
 * @param O (Optional) type of dialog options passed into the step.
 * @param step Contextual information for the current step being executed.
 */
export type WaterfallStep<O extends object = {}> = (step: WaterfallStepContext<O>) => Promise<DialogTurnResult>

/**
 * A waterfall is a dialog that's optimized for prompting a user with a series of questions.
 *
 */
export class WaterfallDialog<O extends object = {}> extends Dialog<O> {
  private readonly steps: WaterfallStep<O>[]

  /**
     * Creates a new waterfall dialog containing the given array of steps.
     *
     * @remarks
     * See the addstep function for details on creating a valid step function.
     * @param dialogId Unique ID of the dialog within the component or set its being added to.
     * @param steps (Optional) array of asynchronous waterfall step functions.
     */
  constructor (dialogId: string, steps?: WaterfallStep<O>[]) {
    super(dialogId)
    this.steps = []
    if (steps) {
      this.steps = steps.slice(0)
    }
  }

  /**
     * Gets the dialog version, composed of the ID and number of steps.
     *
     * @returns Dialog version, composed of the ID and number of steps.
     */
  getVersion (): string {
    // Simply return the id + number of steps to help detect when new steps have
    // been added to a given waterfall.
    return `${this.id}:${this.steps.length}`
  }

  /**
     * Adds a new step to the waterfall.
     *
     * @param step Asynchronous step function to call.
     * @returns Waterfall dialog for fluent calls to `addStep()`.
     */
  addStep (step: WaterfallStep<O>): this {
    this.steps.push(step)

    return this
  }

  /**
     * Called when the WaterfallDialog is started and pushed onto the dialog stack.
     *
     * @param dialogContext The DialogContext for the current turn of conversation.
     * @param options Optional, initial information to pass to the Dialog.
     * @returns A Promise representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the Dialog is still
     * active after the turn has been processed by the dialog.
     */
  async beginDialog (dialogContext: DialogContext, options?: O): Promise<DialogTurnResult> {
    const state: WaterfallDialogState = dialogContext.activeDialog.state as WaterfallDialogState
    state.options = options || {}
    state.values = {
      instanceId: uuidv4(),
    }

    // Run the first step
    return await this.runStep(dialogContext, 0, DialogReason.beginCalled)
  }

  /**
     * Called when the WaterfallDialog is _continued_, where it is the active dialog and the
     * user replies with a new Activity.
     *
     * @param dialogContext The DialogContext for the current turn of conversation.
     * @returns A Promise representing the asynchronous operation.
     * @remarks
     * If the task is successful, the result indicates whether the dialog is still
     * active after the turn has been processed by the dialog. The result may also contain a
     * return value.
     */
  async continueDialog (dialogContext: DialogContext): Promise<DialogTurnResult> {
    // Don't do anything for non-message activities
    if (dialogContext.context.activity.type !== ActivityTypes.Message) {
      return Dialog.EndOfTurn
    }

    // Run next step with the message text as the result.
    return await this.resumeDialog(dialogContext, DialogReason.continueCalled, dialogContext.context.activity.text)
  }

  /**
     * Called when a child WaterfallDialog completed its turn, returning control to this dialog.
     *
     * @param dc The DialogContext for the current turn of the conversation.
     * @param reason DialogReason why the dialog resumed.
     * @param result Optional, value returned from the dialog that was called. The type
     * of the value returned is dependent on the child dialog.
     * @returns A Promise representing the asynchronous operation.
     */
  async resumeDialog (dc: DialogContext, reason: DialogReason, result?: any): Promise<DialogTurnResult> {
    // Increment step index and run step
    const state: WaterfallDialogState = dc.activeDialog.state as WaterfallDialogState

    return await this.runStep(dc, state.stepIndex + 1, reason, result)
  }

  /**
     * Called when an individual waterfall step is being executed.
     *
     * @remarks
     * SHOULD be overridden by derived class that want to add custom logging semantics.
     *
     * @param step Context object for the waterfall step to execute.
     * @returns A promise with the DialogTurnResult.
     */
  protected async onStep (step: WaterfallStepContext<O>): Promise<DialogTurnResult> {
    return await this.steps[step.index](step)
  }

  /**
     * Executes a step of the WaterfallDialog.
     *
     * @param dc The DialogContext for the current turn of conversation.
     * @param index The index of the current waterfall step to execute.
     * @param reason The DialogReason the waterfall step is being executed.
     * @param result Optional, result returned by a dialog called in the previous waterfall step.
     * @returns A Promise that represents the work queued to execute.
     */
  protected async runStep (
    dc: DialogContext,
    index: number,
    reason: DialogReason,
    result?: any
  ): Promise<DialogTurnResult> {
    if (index < this.steps.length) {
      // Update persisted step index
      const state: WaterfallDialogState = dc.activeDialog.state as WaterfallDialogState
      state.stepIndex = index

      // Create step context
      let nextCalled = false
      const step: WaterfallStepContext<O> = new WaterfallStepContext<O>(dc, {
        index,
        options: <O>state.options,
        reason,
        result,
        values: state.values,
        onNext: async (stepResult?: any): Promise<DialogTurnResult<any>> => {
          if (nextCalled) {
            throw new Error(
                            `WaterfallStepContext.next(): method already called for dialog and step '${this.id}[${index}]'.`
            )
          }
          nextCalled = true
          return await this.resumeDialog(dc, DialogReason.nextCalled, stepResult)
        },
      })

      // Execute step
      return await this.onStep(step)
    } else {
      // End of waterfall so just return to parent
      return await dc.endDialog(result)
    }
  }

  /**
     * Identifies the step name by its position index.
     *
     * @param index Step position
     * @returns A string that identifies the step name.
     */
  private waterfallStepName (index: number): string {
    // Log Waterfall Step event. Each event has a distinct name to hook up
    // to the Application Insights funnel.
    let stepName = ''
    if (this.steps[index]) {
      try {
        stepName = this.steps[index].name
      } finally {
        if (stepName === undefined || stepName === '') {
          stepName = 'Step' + (index + 1) + 'of' + this.steps.length
        }
      }
    }
    return stepName
  }
}

/**
 * @private
 */
interface WaterfallDialogState {
  options: object;
  stepIndex: number;
  values: object;
}
