// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, AgentState, AgentStatePropertyAccessor, ConversationState, UserState } from '@microsoft/agents-hosting'
import { Dialog, DialogState } from '@microsoft/agents-hosting-dialogs'
import { RootDialog } from './rootDialog'

export class DialogHandler extends ActivityHandler {
  private conversationState: AgentState
  private userState: AgentState
  private dialog: Dialog
  private dialogState: AgentStatePropertyAccessor<DialogState>

  constructor (conversationState: AgentState, userState: AgentState, dialog: Dialog) {
    super()
    if (!conversationState) throw new Error('[DialogBot]: Missing parameter. conversationState is required')
    if (!userState) throw new Error('[DialogBot]: Missing parameter. userState is required')
    if (!dialog) throw new Error('[DialogBot]: Missing parameter. dialog is required')

    this.conversationState = conversationState as ConversationState
    this.userState = userState as UserState
    this.dialog = dialog
    this.dialogState = this.conversationState.createProperty('DialogState')

    this.onMessage(async (context, next) => {
      console.log('Running dialog with Message Activity.')

      await (this.dialog as RootDialog).run(context, this.dialogState)

      await next()
    })

    this.onDialog(async (context, next) => {
      // Save any state changes. The load happened during the execution of the Dialog.
      await this.conversationState.saveChanges(context, false)
      await this.userState.saveChanges(context, false)
      await next()
    })
  }
}
