// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes } from '@microsoft/agents-activity'
import { AgentApplicationBuilder, Authorization, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

const storage = new MemoryStorage()
export const app = new AgentApplicationBuilder()
  .withStorage(storage)
  .build()

const auth = new Authorization(app)
const guards = auth.initialize({ ah1: { name: 'SSO' } })

app.onMessage('/signout', async (context: TurnContext) => {
  await guards.ah1.logout(context)
  await context.sendActivity(MessageFactory.text('User signed out'))
})

app.onMessage('/signin', async (context: TurnContext) => {
  const ah1 = await guards.ah1.context(context)
  await context.sendActivity(MessageFactory.text(`Token status: ${ah1.token !== undefined}`))
}, [guards.ah1])

app.onMessage('/me', async (context: TurnContext) => {
  await showGraphProfile(context)
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

app.onActivity(ActivityTypes.Invoke, async (context: TurnContext) => {
  const ah1 = await guards.ah1.context(context)
  await context.sendActivity(MessageFactory.text(`Token status: ${ah1.token !== undefined}`))
}, [guards.ah1])

guards.ah1.onSuccess(async (context: TurnContext) => {
  await context.sendActivity(MessageFactory.text('User signed in successfully'))
  await showGraphProfile(context)
})

app.onActivity(ActivityTypes.Message, async (context: TurnContext) => {
  const ah1 = await guards.ah1.context(context)
  if (ah1.token) {
    await context.sendActivity(MessageFactory.text('You are signed in'))
  } else {
    await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
  }
})

async function showGraphProfile (context: TurnContext): Promise<void> {
  const ah1 = await guards.ah1.context(context)
  if (ah1 && ah1.token) {
    const template = new Template(userTemplate)
    const userInfo = await getUserInfo(ah1.token)
    const card = template.expand(userInfo)
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
    await context.sendActivity(activity)
  } else {
    await context.sendActivity(MessageFactory.text(' token not available. Please enter "/signin" to sign in or "/signout" to sign out'))
  }
}
