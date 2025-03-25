import { ActivityHandler, MessageFactory, AgentClient } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'

export class RootHandler extends ActivityHandler {
  constructor () {
    super()
    this.onMessage(async (context, next) => {
      const text = context.activity.text

      if (text?.startsWith('starts')) {
        const botClient: AgentClient = new AgentClient('Agent1')

        const activityStarts = JSON.stringify(context.activity)
        console.log('activityStarts', activityStarts)

        await botClient.postActivity(context.activity, context.adapter.authConfig)
      } else if (text?.startsWith('agent:')) {
        await context.sendActivity(context.activity)
      } else {
        await context.sendActivity(MessageFactory.text(`root-agent: ${context.activity.text}`))
      }

      await next()
    })

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded ?? []
      const welcomeText = `Root Agent running on sdk ${sdkVersion}`
      for (const member of membersAdded) {
        if (member.id !== (context.activity.recipient?.id ?? '')) {
          await context.sendActivity(MessageFactory.text(welcomeText, welcomeText))
        }
      }
      await next()
    })
    this.onEndOfConversation(async (context, next) => {
      const messageText = 'root-agent: Conversation ended'
      await context.sendActivity(MessageFactory.text(messageText, messageText))
      await next()
    })
  }
}
