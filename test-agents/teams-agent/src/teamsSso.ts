// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, CardFactory, MessageFactory, TurnContext, UserState } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'
import { TeamsOAuthFlow } from '@microsoft/agents-hosting-teams'

export class TeamsSso extends ActivityHandler {
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
      if (token !== undefined && token !== '') {
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
