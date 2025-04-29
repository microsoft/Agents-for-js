// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplication, CardFactory, MemoryStorage, MessageFactory, TokenRequestStatus, TurnContext, TurnState, Storage } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from './../../_resources/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

class OAuthAgent extends AgentApplication<TurnState> {
  private readonly _storage: Storage

  constructor (storage?: Storage) {
    super({
      storage,
      authentication: {
        enableSSO: true,
        ssoConnectionName: process.env.connectionName
      }
    })

    this._storage = storage!

    // Register handlers
    this.message('/logout', this._handleSignOut)
    this.message('/login', this._handleSignIn)
    this.message('/me', this._handleProfileRequest)
    this.conversationUpdate('membersAdded', this._handleMembersAdded)
    this.activity(ActivityTypes.Invoke, this._handleInvoke)
    this.onSignInSuccess(this._handleSignInSuccess)
    this.activity(ActivityTypes.Message, this._handleMessage)
  }

  private _handleSignOut = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.userIdentity.signOut(context, state)
    await context.sendActivity(MessageFactory.text('User signed out'))
  }

  private _handleSignIn = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.userIdentity.authenticate(context, state)
  }

  private _handleProfileRequest = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this._showGraphProfile(context, state)
  }

  private _handleMembersAdded = async (context: TurnContext, state: TurnState): Promise<void> => {
    await state.load(context, this._storage)
    const membersAdded = context.activity.membersAdded!
    for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
      if (membersAdded[cnt].id !== context.activity.recipient!.id) {
        await context.sendActivity(MessageFactory.text('Enter "/login" to sign in or "/logout" to sign out'))
        await context.sendActivity(MessageFactory.text('You can also save your user name, just type anything and I will ask What is your name'))
      }
    }
  }

  private _handleInvoke = async (context: TurnContext, state: TurnState): Promise<void> => {
    await this.userIdentity.authenticate(context, state)
  }

  private _handleSignInSuccess = async (context: TurnContext, state: TurnState): Promise<void> => {
    await context.sendActivity(MessageFactory.text('User signed in successfully'))
    await this._showGraphProfile(context, state)
  }

  private _handleMessage = async (context: TurnContext, state: TurnState): Promise<void> => {
    if (this.userIdentity.oAuthFlow.state?.flowStarted === true) {
      const code = Number(context.activity.text)
      if (code.toString().length === 6) {
        await this.userIdentity.authenticate(context, state)
      } else {
        await context.sendActivity(MessageFactory.text('Enter a valid code'))
      }
    } else {
      await context.sendActivity(MessageFactory.text('Enter "/login" to sign in or "/logout" to sign out'))
    }
  }

  private async _showGraphProfile (context: TurnContext, state: TurnState): Promise<void> {
    const userTokenResponse = await this.userIdentity.getToken(context)
    if (userTokenResponse.status === TokenRequestStatus.Success) {
      const template = new Template(userTemplate)
      const userInfo = await getUserInfo(userTokenResponse.token!)
      const card = template.expand(userInfo)
      const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
      await context.sendActivity(activity)
    } else {
      await context.sendActivity(MessageFactory.text(' token not available. Enter "/login" to sign in.'))
    }
  }
}

startServer(new OAuthAgent(new MemoryStorage()))
