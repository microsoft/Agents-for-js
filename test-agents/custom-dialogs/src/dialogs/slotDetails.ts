// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export class SlotDetails {
  public readonly options: object | string

  constructor (public name: string, public promptId: string, public prompt: string = '', public reprompt: string = '') {
    this.name = name
    this.promptId = promptId
    if (prompt.length > 0 && reprompt.length > 0) {
      this.options = {
        prompt,
        retryPrompt: reprompt
      }
    } else {
      this.options = prompt
    }
  }
}
