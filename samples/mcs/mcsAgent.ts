// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { CopilotStudioClient, loadCopilotStudioConnectionSettingsFromEnv } from '@microsoft/agents-copilotstudio-client'
import { AgentApplication, MemoryStorage, MessageFactory, TokenRequestStatus, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

class McsAgent extends AgentApplication<TurnState> {
  private _mcsClient: CopilotStudioClient | undefined

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
    this.onActivity('message', this._message)
  }

  private _signOut = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.authorization.signOut(context, state)
    await context.sendActivity(MessageFactory.text('User signed out'))
  }

  private _status = async (context: TurnContext, state: TurnState): Promise<void> => {
    const tresp = await this.authorization.getToken(context)
    if (tresp.status === TokenRequestStatus.Success) {
      const oboToken = await this.authorization.exchangeToken(context, ['https://api.powerplatform.com/.default'])
      this._mcsClient = await this.createClient(oboToken.token!)
      await this._mcsClient.startConversationAsync()
      await context.sendActivity(MessageFactory.text('Welcome to the MCS Agent demo!, ready to chat with MCS!'))
      console.log('OBO Token received: ' + (oboToken?.token?.length || 0))
    } else {
      await context.sendActivity(MessageFactory.text('Before using the MCS Agent, please sign in.'))
      await this.authorization.beginOrContinueFlow(context, state)
    }
  }

  private _singinSuccess = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('User signed in successfully'))
  }

  private _message = async (context: TurnContext, state: TurnState): Promise<void> => {
    if (this._mcsClient === null || this._mcsClient === undefined) {
      // await context.sendActivity(MessageFactory.text('MCS Client is not initialized.'))
      await this._status(context, state)
      return
    }
    const resp = await this._mcsClient!.askQuestionAsync(context.activity.text!)
    for await (const activity of resp) {
      console.log('Received activity:', activity.type, activity.text)
      if (activity.type === 'message') {
        await context.sendActivity(activity)
      } else if (activity.type === 'typing') {
        await context.sendActivity(new Activity(ActivityTypes.Typing))
      }
    }
  }

  private createClient = async (token: string): Promise<CopilotStudioClient> => {
    const settings = loadCopilotStudioConnectionSettingsFromEnv()
    const copilotClient = new CopilotStudioClient(settings, token)
    return copilotClient
  }
}

startServer(new McsAgent())
