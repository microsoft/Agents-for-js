import { ActivityHandler, MessageFactory, BotClient } from '@microsoft/agents-bot-hosting'
import { version as sdkVersion } from '@microsoft/agents-bot-hosting/package.json'

export class RootBot extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const text = context.activity.text

      if (text?.startsWith('agent')) {
        const botClient: BotClient = new BotClient('Bot1')

        const activityStarts = JSON.stringify(context.activity)
        console.log('activityStarts', activityStarts)

        await botClient.postActivity(context.activity, context.adapter.authConfig)
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
