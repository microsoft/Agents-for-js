import {
  Activity,
  ActivityTreatments,
  ActivityTypes,
  Channels,
  Mention,
  RoleTypes
} from '@microsoft/agents-activity'
import {
  AgentApplication,
  CloudAdapter,
  ConsoleTranscriptLogger,
  CreateConversationOptions,
  CreateConversationOptionsBuilder,
  loadAuthConfigFromEnv,
  M365AttachmentDownloader,
  MemoryStorage,
  MessageFactory,
  TurnContext,
  TurnState
} from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import {
  SetTeamsApiClientMiddleware,
  TeamsAgentExtension,
  TeamsInfo
} from '@microsoft/agents-hosting-extensions-teams'
import {
  PagedMembersResult,
  TeamsChannelAccount
} from '@microsoft/teams.api'
import {
  registerBasicRoutes
} from './basicRoutes'
import {
  createCard
} from './cards'

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

  registerBasicRoutes(app, tae)
})

app
  .onMessage('/attachment', async (context: TurnContext, state: TurnState) => {
    const files = (state.getValue(STORED_FILES_KEY) as unknown[] | undefined) ?? []
    await context.sendActivity(`You sent ${files.length} file(s).`)
  })
  .onMessage('/getMember', async (context) => {
    const member = await TeamsInfo.getMember(context, context.activity.from!.id!)
    await context.sendActivity(`Hello ${member.name}, I am your friendly bot!`)
  })
  .onMessage('/getTeamDetails', async (context) => {
    const team = await TeamsInfo.getTeamDetails(context)
    const teamName = team.name || 'Unknown Team Name'
    await context.sendActivity(`Hello ${teamName}, I am your friendly bot!`)
  })
  .onMessage('/getTeamChannels', async (context) => {
    const channels = await TeamsInfo.getTeamChannels(context)
    for (const channel of channels) {
      await context.sendActivity(`Channel: ${channel.name} (ID: ${channel.id})`)
    }
  })
  .onMessage('/getMeetingInfo', async (context) => {
    const thisTeam = await TeamsInfo.getMeetingInfo(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .onMessage('/getPagedMembers', async (context) => {
    const thisTeam = await TeamsInfo.getPagedMembers(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })

app.onMessage('/targeted', async (context: TurnContext, state: TurnState) => {
  const PAGE_SIZE = 20
  const pages: PagedMembersResult[] = [await TeamsInfo.getPagedMembers(context, PAGE_SIZE)]
  let continuationToken: string | undefined = pages[0].continuationToken
  while (continuationToken) {
    const nextPage = await TeamsInfo.getPagedMembers(context, PAGE_SIZE, continuationToken)
    continuationToken = nextPage.continuationToken
    pages.push(nextPage)
  }

  const members: TeamsChannelAccount[] = pages.flatMap(page => page.members)
  for (const member of members) {
    const activity = new Activity(ActivityTypes.Message)
    activity.text = `${member.name}, this is a **targeted message** - only you can see this.`
    activity.recipient = {
      id: member.id,
      name: member.name,
      role: RoleTypes.User
    }

    activity.entities ??= []
    activity.entities.push({
      type: 'activityTreatment',
      treatment: ActivityTreatments.Targeted
    })

    await context.sendActivity(activity)
  }
})

app.onMessage('/delete', async (context: TurnContext, state: TurnState) => {
  await context.deleteActivity(context.activity.replyToId!)
})

app.onMessage('/card', async (context: TurnContext, state: TurnState) => {
  const card = createCard('Teams Bot Actions')
  const activity = Activity.fromObject({
    type: ActivityTypes.Message,
    attachments: [card]
  })
  await context.sendActivity(activity)
})

app.onMessage('/messageall', async (context: TurnContext, state: TurnState) => {
  let continuationToken: string | undefined

  do {
    const page = await TeamsInfo.getPagedMembers(context, 100, continuationToken)
    continuationToken = page.continuationToken

    for (const member of page.members) {
      if (!context.identity.aud) throw new Error('No audience found in the bot identity.')

      let audience: string = ''
      if (Array.isArray(context.identity.aud)) {
        audience = context.identity.aud[0]
      } else {
        audience = context.identity.aud
      }
      const createOptions: CreateConversationOptions = CreateConversationOptionsBuilder
        .create(audience, Channels.Msteams, context.activity.serviceUrl)
        .withUser(member.id)
        .withTenantId(context.activity.conversation?.tenantId ?? '')
        .isGroup(false)
        .build()

      app.proactive.createConversation(
        adapter,
        createOptions,
        async (proactiveContext) => {
          await proactiveContext.sendActivity(`Hello ${member.name}. I'm a Teams agent.`)
        }
      )
    }
  } while (continuationToken)

  await context.sendActivity('All messages have been sent')
})

app.onMessage('/atmention', async (context: TurnContext, state: TurnState) => {
  const mention: Mention = {
    mentioned: context.activity.from!,
    text: `<at>${context.activity.from?.name}</at>`
  }

  const replyActivity = MessageFactory.text(`Hello ${mention.text}`)
  replyActivity.Entities = [mention]
  await context.sendActivity(replyActivity)
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
  await context.sendActivity('I received your activity. Enter \'help\' to see available commands.')
})

startServer(
  app,
  {
    configureAdapter: (adapter) => {
      adapter.use(new SetTeamsApiClientMiddleware())
    }
  }
)
