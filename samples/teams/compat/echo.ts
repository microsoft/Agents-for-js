import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsActivityHandler } from '@microsoft/agents-hosting-extensions-teams'

class TeamsEchoBot extends TeamsActivityHandler {
  constructor () {
    super()
    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded
      for (const member of membersAdded!) {
        if (member.id !== context.activity.recipient!.id) {
          await context.sendActivity('Welcome to the Teams bot!')
        }
      }
      await next()
    })

    this.onMessage(async (context, next) => {
      await context.sendActivity(`You said: ${context.activity.text}`)
      await next()
    })
  }
}
startServer(new TeamsEchoBot())
