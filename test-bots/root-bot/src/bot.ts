// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, MessageFactory, botClient } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'

export class EchoBot extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const text = context.activity.text
      const replyText = `Echo (root-bot): ${text}`
      await context.sendActivity(MessageFactory.text(replyText, replyText))

      if (text?.includes('agent')) {
        const botClientConfig : botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')
        await botClient.PostActivity(context.activity, botClientConfig, context.adapter.authConfig)
      }

      await next()
    })

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded ?? []
      const welcomeText = `Root bot running on sdk ${sdkVersion}`
      for (const member of membersAdded) {
        if (member.id !== (context.activity.recipient?.id ?? '')) {
          await context.sendActivity(MessageFactory.text(welcomeText, welcomeText))
        }
      }
      await next()
    })
  }
}
