// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplicationBuilder, CardFactory, MemoryStorage, MessageFactory, TokenRequestStatus, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

const storage = new MemoryStorage()
export const app = new AgentApplicationBuilder()
  .withStorage(storage)
  .withAuthentication({ enableSSO: true, ssoConnectionName: process.env.connectionName })
  .build()

const me = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await showGraphProfile(context, state)
}

const signin = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await app.userIdentity.authenticate(context, state)
  await context.sendActivity(MessageFactory.text('User signed in'))
}

const signout = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await app.userIdentity.signOut(context, state)
  await context.sendActivity(MessageFactory.text('User signed out'))
}

const welcome = async (context: TurnContext, state: TurnState) : Promise<void> => {
  await context.sendActivity(MessageFactory.text('Welcome to the Web Chat SSO sample!'))
  await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
}

app.message('/me', me)
app.message('/signout', signout)
app.message('/signin', signin)
app.message('/help', welcome)
app.activity(ActivityTypes.Invoke, signin)
app.conversationUpdate('membersAdded', welcome)

app.onSignInSuccess(async (context: TurnContext, state) => {
  await context.sendActivity(MessageFactory.text('User signed in successfully'))
  await showGraphProfile(context, state)
})

app.activity(ActivityTypes.Message, async (context: TurnContext, state) => {
  if (app.userIdentity.oAuthFlow.state?.flowStarted === true) {
    const code = Number(context.activity.text)
    if (code.toString().length === 6) {
      await app.userIdentity.authenticate(context, state)
    } else {
      await context.sendActivity(MessageFactory.text('Please enter a valid code'))
    }
  } else {
    await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
  }
})

async function showGraphProfile (context: TurnContext, state: TurnState): Promise<void> {
  const userTokenResponse = await app.userIdentity.getToken(context)
  if (userTokenResponse.status === TokenRequestStatus.Success) {
    const template = new Template(userTemplate)
    const userInfo = await getUserInfo(userTokenResponse.token!)
    const card = template.expand(userInfo)
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
    await context.sendActivity(activity)
  } else {
    await context.sendActivity(MessageFactory.text(' token not available. Please enter "/signin" to sign in or "/signout" to sign out'))
  }
}
