// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { CopilotStudioClient, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'
import { AgentApplication, Authorization, AuthorizationGuard, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

class McsAgent extends AgentApplication<TurnState> {
  private auth = new Authorization(this)
  private guards = this.auth.initialize({
    mcs: { text: 'Login into MCS', title: 'MCS Login', scopes: ['https://api.powerplatform.com/.default'] },
  })

  constructor () {
    super({
      storage: new MemoryStorage(),
      startTypingTimer: true,
      longRunningMessages: false
    })

    this.onConversationUpdate('membersAdded', this._status)
    this.onMessage('/logout', this._signOut)
    this.onActivity('message', this._message, [this.guards.mcs])

    this.auth.onSuccess(this._signinSuccess)
  }

  private _signOut = async (context: TurnContext): Promise<void> => {
    await this.auth.logout(context)
    await context.sendActivity(MessageFactory.text('User signed out'))
  }

  private _status = async (context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Welcome to the MCS Agent demo!, ready to chat with MCS!'))
  }

  private _signinSuccess = async (guard: AuthorizationGuard, context: TurnContext): Promise<void> => {
    await context.sendActivity(MessageFactory.text(`User signed in successfully from ${guard.id}`))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    const cid = state.getValue<string>('conversation.conversationId')
    const mcs = await this.guards.mcs.context(context)
    if (!mcs.token) {
      return await this._status(context)
    }
    const cpsClient = this.createClient(mcs.token!)

    if (cid === undefined || cid === null || cid.length === 0) {
      for await (const newAct of cpsClient.startConversationAsync()) {
        if (newAct.type === ActivityTypes.Message) {
          await context.sendActivity(newAct)
          state.setValue('conversation.conversationId', newAct.conversation!.id)
        }
      }
    } else {
      for await (const activity of cpsClient!.askQuestionAsync(context.activity.text!, cid)) {
        console.log('Received activity:', activity.type, activity.text)
        if (activity.type === 'message') {
          await context.sendActivity(activity)
        } else if (activity.type === 'typing') {
          await context.sendActivity(new Activity(ActivityTypes.Typing))
        }
      }
    }
  }

  private createClient = (token: string): CopilotStudioClient => {
    const settings = loadCopilotStudioConnectionSettingsFromEnv()
    const copilotClient = new CopilotStudioClient(settings, token)
    return copilotClient
  }
}

startServer(new McsAgent())
