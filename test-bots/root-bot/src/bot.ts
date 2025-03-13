import { ActivityHandler, BotStatePropertyAccessor, ConversationState, MessageFactory, botClient } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'

interface BotData {
  serviceUrl: string
  channelId: string
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

      if (text?.startsWith('agent')) {
        const botClientConfig: botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')

        const activityStarts = JSON.stringify(context.activity)
        console.log('activityStarts', activityStarts)

        await botClient.PostActivity(context.activity, botClientConfig, context.adapter.authConfig)
      } else if (text?.startsWith('echo-bot:')) {
        await context.sendActivity(context.activity)
      } else {
        await context.sendActivity(MessageFactory.text(`Echo: ${context.activity.text}`))
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
