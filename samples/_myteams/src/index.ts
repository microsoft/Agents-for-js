import {
  AgentApplication,
  CloudAdapter,
  ConsoleTranscriptLogger,
  loadAuthConfigFromEnv,
  M365AttachmentDownloader,
  MemoryStorage,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { SetTeamsApiClientMiddleware, TeamsAgentExtension, TeamsInfo } from '@microsoft/agents-hosting-extensions-teams'

const STORED_FILES_KEY = 'STORED_FILES'

const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const app = new AgentApplication<TurnState>({
  adapter,
  storage: new MemoryStorage(),
  fileDownloaders: [new M365AttachmentDownloader(STORED_FILES_KEY)],
  transcriptLogger: new ConsoleTranscriptLogger()
})

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  console.log('Teams extension registered')

  tae.onMessageEdit(async (context: TurnContext, state: TurnState) => {
    console.log('Message edited:', context.activity.text)
    await context.sendActivity('I noticed you edited your message.')
  })

  tae.onMessageDelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message deleted')
    await context.sendActivity('I noticed you deleted a message.')
  })

  tae.onMessageUndelete(async (context: TurnContext, state: TurnState) => {
    console.log('Message undeleted')
    await context.sendActivity('I noticed you undeleted a message.')
  })

  tae.onTeamsMembersAdded(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members added')
    await context.sendActivity('Welcome to the team!')
  })

  tae.onTeamsMembersRemoved(async (context: TurnContext, state: TurnState) => {
    console.log('Teams members removed')
    await context.sendActivity('A member has left the team.')
  })

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
    .onParticipantsLeave(async (context: TurnContext, state: TurnState) => {
      const participantInfo = context.activity.value
      console.log('Participants left:', participantInfo)
      await context.sendActivity('Goodbye! Thanks for joining the meeting.')
    })
    // .onReaction(async (context: TurnContext, state: TurnState) => {
    //   const reactionInfo = context.activity.value
    //   console.log('Reaction received:', reactionInfo)
    // })
    // .onPollResponse(async (context: TurnContext, state: TurnState) => {
    //   const pollData = context.activity.value
    //   console.log('Poll response received:', pollData)
    // })
    // .onScreenShareStart(async (context: TurnContext, state: TurnState) => {
    //   console.log('Screen sharing started')
    //   await context.sendActivity('Screen sharing has started.')
    // })
    // .onRecordingStarted(async (context: TurnContext, state: TurnState) => {
    //   console.log('Recording started')
    //   await context.sendActivity('Recording has started.')
    // })
    // .onRecordingStopped(async (context: TurnContext, state: TurnState) => {
    //   console.log('Recording stopped')
    //   await context.sendActivity('Recording has stopped.')
    // })
})

app.onMessageReactionAdded(async (context: TurnContext, state: TurnState) => {
  const reactionsAdded = context.activity.reactionsAdded
  if (reactionsAdded && reactionsAdded.length > 0) {
    const reactionType = reactionsAdded[0].type
    console.log('Generic message reaction added:', reactionType)
    await context.sendActivity(`Thanks for adding a ${reactionType} reaction (non-Teams channel).`)
  }
})

app.onMessageReactionRemoved(async (context: TurnContext, state: TurnState) => {
  const reactionsRemoved = context.activity.reactionsRemoved
  if (reactionsRemoved && reactionsRemoved.length > 0) {
    const reactionType = reactionsRemoved[0].type
    console.log('Generic message reaction removed:', reactionType)
    await context.sendActivity(`You removed your ${reactionType} reaction (non-Teams channel).`)
  }
})

app.onMessage('/attachment', async (context: TurnContext, state: TurnState) => {
  const files = (state.getValue(STORED_FILES_KEY) as unknown[] | undefined) ?? []
  await context.sendActivity(`You sent ${files.length} file(s).`)
})

app
  .onMessage('/getMember', async (context) => {
    const thisTeam = await TeamsInfo.getMember(context, context.activity.from!.id!)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .onMessage('/getTeamDetails', async (context) => {
    const thisTeam = await TeamsInfo.getTeamDetails(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .onMessage('/getTeamChannels', async (context) => {
    const thisTeam = await TeamsInfo.getTeamChannels(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .onMessage('/getMeetingInfo', async (context) => {
    const thisTeam = await TeamsInfo.getMeetingInfo(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .onMessage('/getPagedMembers', async (context) => {
    const thisTeam = await TeamsInfo.getPagedMembers(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''

  if (text.toLowerCase().includes('/help')) {
    await context.sendActivity(`
      I can assist during Teams meetings. Here are some commands:
      - '/help' - Show this help message
      \n
      - '/attachment' - Send with attachments to see how many files you have sent
      \n
      - '/getMember' - Get information about a specific team member
      - '/getTeamDetails' - Get details about the current team
      - '/getTeamChannels' - Get a list of channels in the current team
      - '/getMeetingInfo' - Get information about the current meeting
      - '/getPagedMembers' - Get a paged list of team members
      \n
      You can also:
      - Add reactions to messages, and I will respond when reactions are added or removed.
      '
    `)
  } else {
    await context.sendActivity(`I received your message: "${text}". Type "help" to see available commands.`)
  }
})

app.onActivity(() => { return Promise.resolve(true) }, async (context: TurnContext, state: TurnState) => {
  console.log('Received activity:', context.activity)
  await context.sendActivity('I received your activity. How can I assist you?')
})

startServer(
  app,
  {
    configureAdapter: (adapter) => {
      adapter.use(new SetTeamsApiClientMiddleware())
    }
  }
)
