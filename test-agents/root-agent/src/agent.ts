import { ActivityHandler, MessageFactory, AgentClient } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'

export class RootHandler extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const text = context.activity.text

      if (text?.startsWith('agent')) {
        const botClient: AgentClient = new AgentClient('Bot1')

        const activityStarts = JSON.stringify(context.activity)
        console.log('activityStarts', activityStarts)

        await botClient.postActivity(context.activity, context.adapter.authConfig)
      } else if (text?.startsWith('echo-bot:')) {
        await context.sendActivity(context.activity)
      } else {
        await context.sendActivity(MessageFactory.text(`root-bot: ${context.activity.text}`))
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
    this.onEndOfConversation(async (context, next) => {
      const messageText = 'root-bot: Conversation ended'
      await context.sendActivity(MessageFactory.text(messageText, messageText))
      await next()
    })
  }
}
