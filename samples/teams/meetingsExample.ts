import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension, MeetingParticipantsEventDetails, TeamsTurnContext } from '@microsoft/agents-hosting-extensions-msteams'
import { MeetingDetails } from '@microsoft/teams.api'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.meetings
    .onStart(async (context: TeamsTurnContext, state: TurnState, details: MeetingDetails) => {
      console.log('Meeting started:', details)
      await context.sendActivity('Welcome to the meeting! I\'m your meeting assistant.')
    })
    .onEnd(async (context: TeamsTurnContext, state: TurnState, details: MeetingDetails) => {
      console.log('Meeting ended:', details)
      await context.sendActivity('The meeting has ended. Thanks for participating!')
    })
    .onParticipantsJoin(async (context: TeamsTurnContext, state: TurnState, details: MeetingParticipantsEventDetails) => {
      const participantInfo = details
      console.log('Participants joined:', participantInfo)
      await context.sendActivity('Welcome to the meeting!')
    })
    .onParticipantsLeave(async (context: TeamsTurnContext, state: TurnState, details: MeetingParticipantsEventDetails) => {
      const participantInfo = details
      console.log('Participants left:', participantInfo)
      await context.sendActivity('Goodbye from the meeting!')
    })
})

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''

  if (text.toLowerCase().includes('help')) {
    await context.sendActivity(`
      I can assist during Teams meetings. Here are some commands:
      - "meeting info" - Get information about the current meeting
      - "create poll" - Create a quick poll
      - "summarize" - Summarize the meeting discussion so far
    `)
  } else if (text.toLowerCase().includes('meeting info')) {
    await context.sendActivity('This would show information about the current meeting.')
  } else {
    await context.sendActivity(`I received your message: "${text}". Type "help" to see available commands.`)
  }
})

app.onActivity(() => { return Promise.resolve(true) }, async (context: TurnContext, state: TurnState) => {
  console.log('Received activity:', context.activity)
  await context.sendActivity('I received your activity. How can I assist you?')
})

startServer(app)
