import { MessageFactory, TurnContext } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsActivityHandler } from '@microsoft/agents-hosting-extensions-teams'

class TeamsEventsBot extends TeamsActivityHandler {
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

  async onTeamsMessageEdit (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You edited a message')
    await context.sendActivity(reply)
  }

  async onTeamsMessageUndelete (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You undeleted a message')
    await context.sendActivity(reply)
  }

  async onTeamsMessageSoftDelete (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('You deleted a message')
    await context.sendActivity(reply)
  }

  async onTeamsMembersAdded (context: TurnContext): Promise<void> {
    const newMember = JSON.stringify(context.activity.membersAdded)
    const reply = MessageFactory.text('Hi there! You are a new member' + newMember)
    await context.sendActivity(reply)
  }

  async onTeamsMembersRemoved (context: TurnContext): Promise<void> {
    const removedMember = JSON.stringify(context.activity.membersRemoved)
    const reply = MessageFactory.text('Hi there! A team member was removed' + removedMember)
    await context.sendActivity(reply)
  }

  async onTeamsTeamRenamed (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was renamed')
    await context.sendActivity(reply)
  }

  async onTeamsTeamArchived (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was archived')
    console.log('Hi, the team was archived')
    await context.sendActivity(reply)
  }

  async onTeamsTeamDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was deleted')
    console.log('Hi, the team was deleted')
    await context.sendActivity(reply)
  }

  async onTeamsTeamHardDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team was hard deleted')
    console.log('Hi, the team was hard deleted')
    await context.sendActivity(reply)
  }

  async onTeamsTeamRestored (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team has been restored')
    console.log('Hi, the team has been restored')
    await context.sendActivity(reply)
  }

  async onTeamsTeamUnarchived (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the team has been unarchived')
    console.log('Hi, the team has been unarchived')
    await context.sendActivity(reply)
  }

  async onTeamsChannelCreated (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been created')
    await context.sendActivity(reply)
  }

  async onTeamsChannelDeleted (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been deleted')
    await context.sendActivity(reply)
  }

  async onTeamsChannelRenamed (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been renamed')
    await context.sendActivity(reply)
  }

  async onTeamsChannelRestored (context: TurnContext): Promise<void> {
    const reply = MessageFactory.text('Hi, the channel has been restored')
    console.log('Hi, the channel has been restored')
    await context.sendActivity(reply)
  }
}
startServer(new TeamsEventsBot())
