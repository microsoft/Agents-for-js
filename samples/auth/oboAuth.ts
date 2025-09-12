// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, Authorization, AuthorizationGuard, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'

class OboApp extends AgentApplication<TurnState> {
  private auth = new Authorization(this)
  private guards = this.auth.initialize({
    mcs: { name: 'OBOTest', scopes: ['https://api.powerplatform.com/.default'] }
  })

  constructor () {
    super({ storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this._status)
    this.onActivity('message', this._message, [this.guards.mcs])

    this.auth.onSuccess(this._signinSuccess)
  }

  private _status = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the Basic App demo!'))
    const mcs = await this.guards.mcs.context(context)
    if (mcs.token) {
      await context.sendActivity(MessageFactory.text(`OBO Token received: ${mcs.token.length || 0}`))
    } else {
      await context.sendActivity(MessageFactory.text('Token request status: unknown'))
    }
  }

  private _signinSuccess = async (guard: AuthorizationGuard, context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`User signed in successfully from ${guard.id}`))
  }

  private _message = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`You said ${context.activity.text}`))
  }
}

startServer(new OboApp())
