/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */
import { TurnContext } from '@microsoft/agents-hosting'
import { Prompt, PromptOptions, PromptRecognizerResult, PromptValidator } from './prompt'
import { Attachment, InputHints } from '@microsoft/agents-activity'

/**
 * Prompts a user to upload attachments like images.
 *
 * @remarks
 * By default the prompt will return to the calling dialog an `Attachment[]`.
 */
export class AttachmentPrompt extends Prompt<Attachment[]> {
  // eslint-disable-next-line @typescript-eslint/no-useless-constructor
  constructor (dialogId: string, validator?: PromptValidator<Attachment[]>) {
    super(dialogId, validator)
  }

  /**
     * Prompts the user for input.
     *
     * @param context Context for the current turn of conversation with the user.
     * @param state Contains state for the current instance of the prompt on the dialog stack.
     * @param options A prompt options object constructed from the options initially provided
     * in the call to Prompt.
     * @param isRetry `true` if this is the first time this prompt dialog instance
     * on the stack is prompting the user for input; otherwise, false.
     * @returns A Promise representing the asynchronous operation.
     */
  protected async onPrompt (
    context: TurnContext,
    state: any,
    options: PromptOptions,
    isRetry: boolean
  ): Promise<void> {
    if (isRetry && options.retryPrompt) {
      await context.sendActivity(options.retryPrompt, undefined, InputHints.ExpectingInput)
    } else if (options.prompt) {
      await context.sendActivity(options.prompt, undefined, InputHints.ExpectingInput)
    }
  }

  /**
     * Attempts to recognize the user's input.
     *
     * @param context Context for the current turn of conversation with the user.
     * @param _state Contains state for the current instance of the prompt on the dialog stack.
     * @param _options A prompt options object constructed from the options initially provided
     * in the call to Prompt.
     * @returns A Promise representing the asynchronous operation.
     */
  protected async onRecognize (
    context: TurnContext,
    _state: any,
    _options: PromptOptions
  ): Promise<PromptRecognizerResult<Attachment[]>> {
    const value: Attachment[] = context.activity.attachments

    return Array.isArray(value) && value.length > 0 ? { succeeded: true, value } : { succeeded: false }
  }
}
