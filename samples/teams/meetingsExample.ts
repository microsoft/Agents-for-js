import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  tae.meeting
    .onMeetingStart(async (context: TurnContext, state: TurnState) => {
      console.log('Meeting started:', context.activity.value)
      await context.sendActivity('Welcome to the meeting! I\'m your meeting assistant.')
    })
    .onMeetingEnd(async (context: TurnContext, state: TurnState) => {
      console.log('Meeting ended:', context.activity.value)
      await context.sendActivity('The meeting has ended. Thanks for participating!')
    })
    .onParticipantsJoin(async (context: TurnContext, state: TurnState) => {
      const participantInfo = context.activity.value
      console.log('Participants joined:', participantInfo)
      await context.sendActivity('Welcome to the meeting!')
    })
    .onReaction(async (context: TurnContext, state: TurnState) => {
      const reactionInfo = context.activity.value
      console.log('Reaction received:', reactionInfo)
    })
    .onPollResponse(async (context: TurnContext, state: TurnState) => {
      const pollData = context.activity.value
      console.log('Poll response received:', pollData)
    })
    .onScreenShareStart(async (context: TurnContext, state: TurnState) => {
      console.log('Screen sharing started')
      await context.sendActivity('Screen sharing has started.')
    })
    .onRecordingStarted(async (context: TurnContext, state: TurnState) => {
      console.log('Recording started')
      await context.sendActivity('Recording has started.')
    })
    .onRecordingStopped(async (context: TurnContext, state: TurnState) => {
      console.log('Recording stopped')
      await context.sendActivity('Recording has stopped.')
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
