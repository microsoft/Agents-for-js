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
  .withAuthorization({ ah1: { name: 'SSO' } })
  .build()

app.onMessage('/signout', async (context: TurnContext, state: TurnState) => {
  await app.authorization.signOut(context, state)
  await context.sendActivity(MessageFactory.text('User signed out'))
})

app.onMessage('/signin', async (context: TurnContext, state: TurnState) => {
  await app.authorization.beginOrContinueFlow(context, state)
})

app.onMessage('/me', async (context: TurnContext, state: TurnState) => {
  await showGraphProfile(context, state)
})

app.onConversationUpdate('membersAdded', async (context: TurnContext, state: TurnState) => {
  await state.load(context, storage)
  const membersAdded = context.activity.membersAdded!
  for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
    if (membersAdded[cnt].id !== context.activity.recipient!.id) {
      await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
      await context.sendActivity(MessageFactory.text('You can also save your user name, just type anything and I will ask What is your name'))
    }
  }
})

app.onActivity(ActivityTypes.Invoke, async (context: TurnContext, state: TurnState) => {
  await app.authorization.beginOrContinueFlow(context, state)
})

app.onSignInSuccess(async (context: TurnContext, state: TurnState) => {
  await context.sendActivity(MessageFactory.text('User signed in successfully'))
  await showGraphProfile(context, state)
})

app.onActivity(ActivityTypes.Message, async (context: TurnContext, state: TurnState) => {
  if (app.authorization.getFlowState() === true) {
    const code = Number(context.activity.text)
    if (code.toString().length === 6) {
      await app.authorization.beginOrContinueFlow(context, state)
    } else {
      await context.sendActivity(MessageFactory.text('Please enter a valid code'))
    }
  } else {
    await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
  }
})

async function showGraphProfile (context: TurnContext, state: TurnState): Promise<void> {
  const userTokenResponse = await app.authorization.getToken(context)
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
