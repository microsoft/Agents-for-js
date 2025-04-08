// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, AgentApplicationBuilder, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

interface ConversationData {
  promptedForUserName: boolean;
  timestamp?: string;
  channelId?: string;
}

interface UserProfile {
  name?: string;
}

type ApplicationTurnState = TurnState<ConversationData, UserProfile>
const storage = new MemoryStorage()
export const app = new AgentApplicationBuilder<ApplicationTurnState>()
  .withStorage(storage)
  .withAuthentication({ enableSSO: true, ssoConnectionName: process.env.connectionName }).build()

app.message('/signout', async (context: TurnContext, state: ApplicationTurnState) => {
  await app.userAuthorization.signOut(context, state)
  await context.sendActivity(MessageFactory.text('User signed out'))
})

app.message('/signin', async (context: TurnContext, state: ApplicationTurnState) => {
  await state.load(context, storage)
  await getToken(context, state)
})

app.message('/getUserProfile', async (context: TurnContext, state: ApplicationTurnState) => {
  await context.sendActivity(MessageFactory.text(`User is: ${state.user.name}`))
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  await state.load(context, storage)
  const membersAdded = context.activity.membersAdded!
  for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
    if (membersAdded[cnt].id !== context.activity.recipient!.id) {
      await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
      await context.sendActivity(MessageFactory.text('You can also save your user name, just type anything and I will ask What is your name'))
    }
  }
})

app.activity(ActivityTypes.Message, async (context: TurnContext, state: ApplicationTurnState) => {
  const code = Number(context.activity.text)
  if (code.toString().length === 6) {
    await getToken(context, state)
  } else {
    const userProfile = state.user
    console.log('User Profile:', userProfile)

    const conversationData = state.conversation
    console.log('Conversation Data:', conversationData)

    if (!userProfile.name) {
      if (conversationData.promptedForUserName) {
        userProfile.name = context.activity.text

        await context.sendActivity(`Thanks ${userProfile.name}. To see user data, type /getUserProfile.`)

        conversationData.promptedForUserName = false
      } else {
        await context.sendActivity('What is your name?')
        conversationData.promptedForUserName = true
      }
    }
  }
})

async function getToken (context: TurnContext, state: ApplicationTurnState): Promise<void> {
  const userToken = await app.userAuthorization.getOAuthToken(context, state)
  if (userToken.length !== 0) {
    await sendLoggedUserInfo(context, userToken)
  }
}

async function sendLoggedUserInfo (context: TurnContext, token:string): Promise<void> {
  const template = new Template(userTemplate)
  const userInfo = await getUserInfo(token)
  const card = template.expand(userInfo)
  const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
  await context.sendActivity(activity)
}
