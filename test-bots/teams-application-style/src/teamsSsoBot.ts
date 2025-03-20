// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityTypes, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState } from '@microsoft/agents-bot-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'
import { TeamsApplicationBuilder } from '@microsoft/agents-bot-hosting-teams'

interface ConversationData {
  promptedForUserName?: boolean;
  timestamp?: string;
  channelId?: string;
}

interface UserProfile {
  name?: string;
}

type ApplicationTurnState = TurnState<ConversationData, UserProfile>
const storage = new MemoryStorage()
export const app = new TeamsApplicationBuilder<ApplicationTurnState>().withStorage(storage).withAuthentication({ enableSSO: true }).setRemoveRecipientMention(false).build()

app.message('/signout', async (context: TurnContext, state: ApplicationTurnState) => {
  await app.teamsAuthManager.signOut(context)
})

app.message('/signin', async (context: TurnContext, state: ApplicationTurnState) => {
  const userToken = await app.teamsAuthManager.beginFlow(context, state)
  if (userToken !== '') {
    await sendLoggedUserInfo(context, userToken).then(async () => {
      const token = await app.teamsAuthManager.continueFlow(context)
      if (token !== '') {
        await sendLoggedUserInfo(context, token)
      }
    })
  }
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  await state.load(context, storage)
  const membersAdded = context.activity.membersAdded!
  for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
    if (membersAdded[cnt].id !== context.activity.recipient!.id) {
      await context.sendActivity(MessageFactory.text('Please enter "/signin" to sign in or "/signout" to sign out'))
      await context.sendActivity(MessageFactory.text('If you are already singed in you can see the data by typing /loggedUserInfo'))
    }
  }
})

app.message('/loggedUserInfo', async (context: TurnContext, state: ApplicationTurnState) => {
  const userToken = await app.teamsAuthManager.userSignedInToken(context)
  if (userToken && userToken !== '') {
    await sendLoggedUserInfo(context, userToken)
  } else {
    await context.sendActivity(MessageFactory.text('User is not signed in'))
  }
})

app.activity(ActivityTypes.Invoke, async (context: TurnContext, state: ApplicationTurnState) => {
  const token = await app.teamsAuthManager.continueFlow(context)
  if (token !== '') {
    await sendLoggedUserInfo(context, token)
  }
})

async function sendLoggedUserInfo (context: TurnContext, token: string): Promise<void> {
  const template = new Template(userTemplate)
  const userInfo = await getUserInfo(token)
  const card = template.expand(userInfo)
  await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
}
