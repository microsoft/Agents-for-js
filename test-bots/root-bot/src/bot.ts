import { ActivityHandler, BotStatePropertyAccessor, ConversationState, MemoryStorage, MessageFactory, StoreItem, botClient } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'

interface BotData {
  serviceUrl: string
  channelId: string
  conversationId: string
}

export class RootBot extends ActivityHandler {
  conversationState: ConversationState
  conversationDataAccessor: BotStatePropertyAccessor<BotData>
  memoryForBot: MemoryStorage
  constructor (conversationState: ConversationState) {
    super()
    this.conversationState = conversationState
    this.conversationDataAccessor = conversationState.createProperty<BotData>('botData')
    this.memoryForBot = MemoryStorage.getSingleInstance()
    this.onMessage(async (context, next) => {
      const text = context.activity.text

      if (text?.startsWith('agent')) {
        const botClientConfig: botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')
        // await this.conversationDataAccessor.set(context, { serviceUrl: context.activity.serviceUrl!, channelId: context.activity.callerId!, conversationId: context.activity.conversation!.id })
        // await this.conversationState.saveChanges(context, false)
        // const botData2 = await this.conversationDataAccessor.get(context)
        // console.log('Saved botData:', botData2)
        const changes: StoreItem = {} as StoreItem
        changes['botData'] = { serviceUrl: context.activity.serviceUrl!, channelId: context.activity.callerId!, conversationId: context.activity.conversation!.id }
        await this.memoryForBot.write(changes)

        await botClient.PostActivity(context.activity, botClientConfig, context.adapter.authConfig)
      } else if (text?.startsWith('echo-bot:')) {
        // const botData = await this.conversationDataAccessor.get(context)
        // console.log('Retrieved botData:', botData)
        // const test2 = await this.conversationState.get(context)
        // console.log('State:', test2)

        // if (botData?.serviceUrl && botData?.conversationId) {
        // const botClientConfig: botClient.BotClientConfig = botClient.loadBotClientConfig('Bot1')

        const dataForBot = await this.memoryForBot.read(['botData'])
        context.activity.serviceUrl = dataForBot.botData.serviceUrl
        context.activity.conversation!.id = dataForBot.botData.conversationId
        // const message = MessageFactory.text(`From echo-bot: ${context.activity.text}`)
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
