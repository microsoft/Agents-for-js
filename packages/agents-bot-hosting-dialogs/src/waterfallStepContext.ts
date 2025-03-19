/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { DialogContext } from './dialogContext'
import { DialogReason } from './dialogReason'
import { DialogTurnResult } from './dialogTurnResult'

/**
 * Values passed to the `WaterfallStepContext` constructor.
 */
export interface WaterfallStepInfo<O extends object> {
  index: number;
  options: O;
  reason: DialogReason;
  result: any;
  values: object;
  onNext(result?: any): Promise<DialogTurnResult>;
}

/**
 * Context object passed in to a `WaterfallStep`.
 *
 * @param O (Optional) type of options passed to the steps waterfall dialog in the call to `DialogContext.beginDialog()`.
 */
export class WaterfallStepContext<O extends object = {}> extends DialogContext {
  private _stepInfo: WaterfallStepInfo<O>

  /**
     * Creates a new WaterfallStepContext instance.
     *
     * @param dialogContext The dialog context for the current turn of conversation.
     * @param stepInfo Values to initialize the step context with.
     */
  constructor (dialogContext: DialogContext, stepInfo: WaterfallStepInfo<O>) {
    super(dialogContext.dialogs, dialogContext, { dialogStack: dialogContext.stack })
    this._stepInfo = stepInfo
    this.parent = dialogContext.parent
  }

  /**
     * The index of the current waterfall step being executed.
     *
     * @returns The index of the current waterfall step being executed.
     */
  get index (): number {
    return this._stepInfo.index
  }

  /**
     * Any options passed to the steps waterfall dialog when it was started with
     * `DialogContext.beginDialog()`.
     *
     * @returns Any options the waterfall dialog was called with.
     */
  get options (): O {
    return this._stepInfo.options
  }

  /**
     * The reason the waterfall step is being executed.
     *
     * @returns The reason the waterfall step is being executed.
     */
  get reason (): DialogReason {
    return this._stepInfo.reason
  }

  /**
     * Results returned by a dialog or prompt that was called in the previous waterfall step.
     *
     * @returns The result from the previous waterfall step.
     */
  get result (): any {
    return this._stepInfo.result
  }

  /**
     * A dictionary of values which will be persisted across all waterfall steps.
     *
     * @returns A dictionary of values which will be persisted across all waterfall steps.
     */
  get values (): object {
    return this._stepInfo.values
  }

  /**
     * Skips to the next waterfall step.
     *
     * @param result (Optional) result to pass to the next step.
     * @returns A promise with the DialogTurnResult.
     */
  async next (result?: any): Promise<DialogTurnResult> {
    return await this._stepInfo.onNext(result)
  }
}
