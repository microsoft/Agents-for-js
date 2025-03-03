// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, BotStatePropertyAccessor, ConversationState, MessageFactory, TurnContext, botClient } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'

interface BotData {
  serviceUrl: string
  conversationId: string
}

export class RootBot extends ActivityHandler {
  conversationState: ConversationState
  conversationDataAccessor: BotStatePropertyAccessor<BotData>

  constructor (conversationState: ConversationState) {
    super()
    this.conversationState = conversationState
    this.conversationDataAccessor = conversationState.createProperty<BotData>('botData')

    this.onMessage(async (context, next) => {
      const text = context.activity.text
      // const replyText = `root-bot: ${text}`
      // await context.sendActivity(MessageFactory.text(replyText, replyText))

      if (text?.startsWith('agent')) {
        const botClientConfig: botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')
        await this.conversationDataAccessor.set(context, { serviceUrl: context.activity.serviceUrl!, conversationId: context.activity.conversation!.id })
        const botData2 = await this.conversationDataAccessor.get(context, { serviceUrl: '', conversationId: '' })
        console.log(botData2)
        await this.conversationState.saveChanges(context, false)
        await botClient.PostActivity(context.activity, botClientConfig, context.adapter.authConfig)
      } else {
        const botData = await this.conversationDataAccessor.get(context)
        const test2 = await this.conversationState.get(context)
        console.log(test2)

        if (botData.serviceUrl && botData.conversationId) {
          const botClientConfig: botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')
          await botClient.PostActivity(context.activity, botClientConfig, context.adapter.authConfig)
        }
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

  async run (context: TurnContext) {
    await super.run(context)
    await this.conversationState.saveChanges(context, false)
  }
}
