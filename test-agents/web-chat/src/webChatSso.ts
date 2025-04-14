// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, CardFactory, MessageFactory, TurnContext, UserState, OAuthFlow } from '@microsoft/agents-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../cards/UserProfileCard.json'
import { getUserInfo } from './userGraphClient'

export class WebChatSsoHandler extends ActivityHandler {
  oAuthFlow: OAuthFlow

  userState: UserState
  constructor (userState: UserState) {
    super()
    this.userState = userState
    this.oAuthFlow = new OAuthFlow(userState)

    this.onConversationUpdate(async (context, next) => {
      await context.sendActivity('Welcome to the Web Chat SSO sample. Type "signin" to sign in or "signout" to sign out.')
      const tokenResponse = await this.oAuthFlow.beginFlow(context)
      if (tokenResponse.token !== null) {
        await this.sendLoggedUserInfo(context, tokenResponse.token)
      }
      await next()
    })

    this.onMessage(async (context, next) => {
      if (context.activity.text === 'signout') {
        await this.oAuthFlow.signOut(context)
        await context.sendActivity(MessageFactory.text('User signed out'))
        return
      } else if (context.activity.text === 'signin') {
        await this.beginOAuthFlow(context)
      } else {
        const code = Number(context.activity.text)
        if (code.toString().length !== 6) {
          await context.sendActivity(MessageFactory.text('Please enter "signin" to sign in or "signour" to sign out'))
        } else {
          const token = await this.oAuthFlow.continueFlow(context)
          if (token !== null) {
            await this.sendLoggedUserInfo(context, token)
          }
        }
      }

      await next()
    })

    this.onSignInInvoke(async (context, next) => {
      const token = await this.oAuthFlow.continueFlow(context)
      if (token !== null) {
        await this.sendLoggedUserInfo(context, token)
      }
      await next()
    })
  }

  async beginOAuthFlow (context: TurnContext): Promise<void> {
    const tokenResponse = await this.oAuthFlow.beginFlow(context)
    if (tokenResponse.token !== null) {
      await this.sendLoggedUserInfo(context, tokenResponse.token)
    }
  }

  async sendLoggedUserInfo (context: TurnContext, token:string): Promise<void> {
    const template = new Template(userTemplate)
    const userInfo = await getUserInfo(token)
    const card = template.expand(userInfo)
    // await context.sendActivity(JSON.stringify(userInfo))
    const activity = MessageFactory.attachment(CardFactory.adaptiveCard(card))
    await context.sendActivity(activity)
  }

  async run (context: TurnContext) {
    await super.run(context)
    await this.userState.saveChanges(context, false)
  }
}
