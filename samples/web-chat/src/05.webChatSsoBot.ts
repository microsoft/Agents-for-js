// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, CardFactory, MessageFactory, TurnContext, UserState, WebChatOAuthFlow } from '@microsoft/agents-bot-hosting'
import { Template } from 'adaptivecards-templating'
import * as userTemplate from '../resources/UserProfileCard.json'
import { getUserInfo } from './helpers/userGraphClient'

export class WebChatSsoBot extends ActivityHandler {
  webChatOAuthFlow: WebChatOAuthFlow

  userState: UserState
  constructor (userState: UserState) {
    super()
    this.userState = userState
    this.webChatOAuthFlow = new WebChatOAuthFlow(userState)

    this.onMessage(async (context, next) => {
      if (context.activity.text === 'signout') {
        await this.webChatOAuthFlow.signOut(context)
        await context.sendActivity(MessageFactory.text('User signed out'))
        return
      }

      const userToken = await this.webChatOAuthFlow.getOAuthToken(context)
      if (userToken.length !== 0) {
        await this.sendLoggedUserInfo(context, userToken)
      }

      await next()
    })
  }

  async sendLoggedUserInfo (context: TurnContext, token:string): Promise<void> {
    const template = new Template(userTemplate)
    const userInfo = await getUserInfo(token)
    const card = template.expand(userInfo)
    await context.sendActivity(MessageFactory.attachment(CardFactory.adaptiveCard(card)))
  }

  async run (context: TurnContext) {
    await super.run(context)
    await this.userState.saveChangesAsync(context, false)
  }
}
