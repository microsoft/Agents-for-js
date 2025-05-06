import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { MyTeamsExt } from '@microsoft/agents-hosting-extensions-teams'
// Create the main agent application
const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

// Create and register the Meetings extension
const teamsExt = new MyTeamsExt(app)

// Register the extension and add event handlers
app.registerExtension<MyTeamsExt>(teamsExt, (tae) => {
  console.log('Teams Meetings extension registered')

  // Handle meeting start
  tae.meeting.onMeetingStart(async (context: TurnContext, state: TurnState) => {
    console.log('Meeting started:', context.activity.value)
    await context.sendActivity('Welcome to the meeting! I\'m your meeting assistant.')
  })

  // Handle meeting end
  tae.meeting.onMeetingEnd(async (context: TurnContext, state: TurnState) => {
    console.log('Meeting ended:', context.activity.value)
    await context.sendActivity('The meeting has ended. Thanks for participating!')
  })

  // Handle participants joining
  tae.meeting.onParticipantsJoin(async (context: TurnContext, state: TurnState) => {
    const participantInfo = context.activity.value
    console.log('Participants joined:', participantInfo)
    await context.sendActivity('Welcome to the meeting!')
  })

  // Handle meeting reactions (like emojis)
  tae.meeting.onReaction(async (context: TurnContext, state: TurnState) => {
    const reactionInfo = context.activity.value
    console.log('Reaction received:', reactionInfo)
    // You could respond to specific reactions here
  })

  // Handle polls
  tae.meeting.onPollResponse(async (context: TurnContext, state: TurnState) => {
    const pollData = context.activity.value
    console.log('Poll response received:', pollData)
    // Process poll results here
  })

  // Handle screen sharing
  tae.meeting.onScreenShareStart(async (context: TurnContext, state: TurnState) => {
    console.log('Screen sharing started')
    await context.sendActivity('Screen sharing has started.')
  })
})

// Handle regular messages
app.activity('message', async (context: TurnContext, state: TurnState) => {
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

// Start the server
startServer(app)
