// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, MessageFactory, TokenRequestStatus, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'

class CreateAppDemo extends AgentApplication<TurnState> {
  private readonly _storage: Storage

  constructor (storage?: Storage) {
    super({
      storage,
      authorization: {}
    })

    this._storage = storage!

    this.conversationUpdate('membersAdded', this._status)
    this.activity(ActivityTypes.Invoke, this._invoke)
    this.activity(ActivityTypes.Message, this._message)
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    if (!this.authorization) {
      await context.sendActivity(MessageFactory.text('Authorization not configured'))
      return
    }
    const github = await this.authorization.getToken(context, 'github')
    const graph = await this.authorization.getToken(context, 'graph')
    const status = `GitHub flow status: ${github.status} ${github.token?.length}  
                    Graph flow status: ${graph.status} ${graph.token?.length}`
    await context.sendActivity(MessageFactory.text(status))
    await context.sendActivity(MessageFactory.text('Enter "/login" to sign in or "/logout" to sign out. /me to see your profile. /prs to see your pull requests.'))
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.beginOrContinueFlow(context, state)
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    const isMagicCode = context.activity.text?.match(/^\d{6}$/)
    if (isMagicCode) {
      for (const ah in this.authorization._authHandlers) {
        const flow = this.authorization._authHandlers[ah].flow
        if (flow?.state?.flowStarted) {
          const tresp = await this.authorization.beginOrContinueFlow(context, state, ah)
          if (tresp.status !== TokenRequestStatus.Success) {
            await context.sendActivity(MessageFactory.text('Failed to complete the flow ' + ah))
          }
        }
      }
    } else {
      await context.sendActivity(MessageFactory.text('You said.' + context.activity.text))
    }
  }
}

startServer(new CreateAppDemo())
