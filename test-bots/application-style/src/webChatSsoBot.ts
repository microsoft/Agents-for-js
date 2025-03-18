// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, ApplicationBuilder, CardFactory, FlowState, MemoryStorage, MessageFactory, TurnContext, WebChatOAuthFlowAppStyle } from '@microsoft/agents-bot-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

interface UserProfile {
  name?: string;
}

type ApplicationTurnState = FlowState<UserProfile>
const storage = new MemoryStorage()
export const app = new ApplicationBuilder<ApplicationTurnState>().withStorage(storage).build()

const webChatOAuthFlow = new WebChatOAuthFlowAppStyle(storage)

app.message('/signout', async (context: TurnContext, state: ApplicationTurnState) => {
  await webChatOAuthFlow.signOut(context, state)
  await context.sendActivity(MessageFactory.text('User signed out'))
})

app.message('/signin', async (context: TurnContext, state: ApplicationTurnState) => {
  await getToken(context, state)
})

app.activity(ActivityTypes.Message, async (context: TurnContext, state: ApplicationTurnState) => {
  const code = Number(context.activity.text)
  if (code.toString().length !== 6) {
    await context.sendActivity(MessageFactory.text('Please enter "signin" to sign in or "signout" to sign out'))
  } else {
    await getToken(context, state)
  }
})

async function getToken (context: TurnContext, state: ApplicationTurnState): Promise<void> {
  const userToken = await webChatOAuthFlow.getOAuthToken(context, state)
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
