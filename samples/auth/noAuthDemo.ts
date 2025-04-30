// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'

class NoAuthDemo extends AgentApplication<TurnState> {
  constructor () {
    super()
    this.conversationUpdate('membersAdded', this._status)
    this.activity(ActivityTypes.Invoke, this._invoke)
    this.activity(ActivityTypes.Message, this._message)
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the Create App demo!'))
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Invoke received.'))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('You said.' + context.activity.text))
  }
}

startServer(new NoAuthDemo())
