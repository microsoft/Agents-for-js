// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { CopilotStudioClient, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'
import { AgentApplication, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

class McsAgent extends AgentApplication<TurnState> {
  constructor () {
    super({
      storage: new MemoryStorage(),
      authorization: {
        mcs: { text: 'Login into MCS', title: 'MCS Login' }
      }
    })

    this.onConversationUpdate('membersAdded', this._status)
    this.authorization.onSignInSuccess(this._singinSuccess)
    this.onMessage('/logout', this._signOut)
    this.onActivity('invoke', this._invoke)
    this.onActivity('message', this._message)
  }

  private _signOut = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.signOut(context, state)
    // state.deleteValue('user.oboToken')
    await context.sendActivity(MessageFactory.text('User signed out'))
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    const tresp = await this.authorization.getToken(context)
    if (tresp.token) {
      const oboToken = await this.authorization.exchangeToken(context, ['https://api.powerplatform.com/.default'])
      await context.sendActivity(MessageFactory.text('Welcome to the MCS Agent demo!, ready to chat with MCS!'))
      console.log('OBO Token received: ' + (oboToken?.token?.length || 0))
    } else {
      const tokenResp = await this.authorization.beginOrContinueFlow(context, state)
      if (!tokenResp?.token) {
        await context.sendActivity(MessageFactory.text('Before using the MCS Agent, please sign in.'))
      }
    }
  }

  private _singinSuccess = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('User signed in successfully'))
  }

  private _invoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('Invoke received.'))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    const cid = state.getValue<string>('conversation.conversationId')
    const oboToken = await this.authorization.exchangeToken(context, ['https://api.powerplatform.com/.default'])
    if (!oboToken.token) {
      await this._status(context, state)
      return
    }
    const cpsClient = this.createClient(oboToken.token!)

    if (cid === undefined || cid === null || cid.length === 0) {
      const newAct = await cpsClient.startConversationAsync()
      if (newAct.type === ActivityTypes.Message) {
        await context.sendActivity(newAct.text!)
        state.setValue('conversation.conversationId', newAct.conversation!.id)
      }
    } else {
      const resp = await cpsClient!.askQuestionAsync(context.activity.text!, cid)
      for await (const activity of resp) {
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
