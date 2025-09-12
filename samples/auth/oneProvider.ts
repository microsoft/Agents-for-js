// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, Authorization, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'

class OneProvider extends AgentApplication<TurnState> {
  private auth = new Authorization(this)
  private guards = this.auth.initialize({
    graph: { name: 'SSOSelf' }
  })

  constructor () {
    super({ storage: new MemoryStorage() })

    this.onConversationUpdate('membersAdded', this._status)
    this.onMessage('logout', this._logout)
    this.onActivity('invoke', this._invoke)
    this.onActivity('message', this._message, [this.guards.graph])

    this.guards.graph.onSuccess(this._singninSuccess)
  }

  private _status = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the Basic App demo!'))
    const graph = await this.guards.graph.context(context)
    if (graph.token) {
      await context.sendActivity(MessageFactory.text(`Token received: ${graph.token.length}`))
    } else {
      await context.sendActivity(MessageFactory.text('Token request status: unknown'))
    }
  }

  private _logout = async (context: TurnContext): Promise<void> => {
    await this.guards.graph.logout(context)
    await context.sendActivity(MessageFactory.text('user logged out'))
  }

  private _invoke = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Invoke received.'))
  }

  private _singninSuccess = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`User signed in successfully from ${this.guards.graph.id}`))
  }

  private _message = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`You said ${context.activity.text}`))
  }
}

startServer(new OneProvider())
