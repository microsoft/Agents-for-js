// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, ActivityTypes, CardFactory, MemoryStorage, MessageFactory, TurnContext, TurnState, UserState } from '@microsoft/agents-bot-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'
import { TeamsApplication, TeamsOAuthFlow } from '@microsoft/agents-bot-hosting-teams'

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
export const app = new TeamsApplication({
  removeRecipientMention: false,
  authentication: {
    enableSSO: true,
  },
  storage
})

app.message('/signout', async (context: TurnContext, state: ApplicationTurnState) => {
  await app.teamsAuthManager.signOut(context, state)
})

app.message('/signin', async (context: TurnContext, state: ApplicationTurnState) => {
  const userToken = await app.teamsAuthManager.beginFlow(context, state)
  if (userToken !== '') {
    await sendLoggedUserInfo(context, userToken)
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
  if (state.sso.userToken) {
    await sendLoggedUserInfo(context, state.sso.userToken!)
  }
})

app.activity(ActivityTypes.Invoke, async (context: TurnContext, state: ApplicationTurnState) => {
  const token = await app.teamsAuthManager.continueFlow(context, state)
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

export class TeamsSsoBot extends ActivityHandler {
  teamsOAuthFlow: TeamsOAuthFlow
  userState: UserState
  constructor (userState: UserState) {
    super()
    this.userState = userState
    this.teamsOAuthFlow = new TeamsOAuthFlow(userState)

    this.onMessage(async (context, next) => {
      if (context.activity.text === 'signout') {
        await this.teamsOAuthFlow.signOut(context)
        return
      }
      if (context.activity.text === 'signin') {
        const userToken = await this.teamsOAuthFlow.beginFlow(context)
        if (userToken !== '') {
          await this.sendLoggedUserInfo(context, userToken)
        }
        return
      }
      if (this.teamsOAuthFlow.state?.userToken === undefined || this.teamsOAuthFlow.state?.userToken === '') {
        await context.sendActivity(MessageFactory.text('Please type signin to sign in, or signout to sign out'))
      } else {
        await this.sendLoggedUserInfo(context, this.teamsOAuthFlow.state?.userToken!)
      }
      await next()
    })

    this.onSignInInvoke(async (context, next) => {
      const token = await this.teamsOAuthFlow.continueFlow(context)
      if (token !== '') {
        await this.sendLoggedUserInfo(context, token)
      }
      await next()
    })
  }

  async sendLoggedUserInfo (context: TurnContext, token: string): Promise<void> {
    const template = new Template(userTemplate)
    const userInfo = await getUserInfo(token)
    const card = template.expand(userInfo)
    await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
  }

  async run (context: TurnContext) {
    await super.run(context)
    await this.userState.saveChanges(context, false)
  }
}
