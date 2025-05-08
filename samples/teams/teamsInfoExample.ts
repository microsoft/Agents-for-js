import { AgentApplication, MemoryStorage, MessageFactory, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsInfo, parseTeamsChannelData } from '@microsoft/agents-hosting-extensions-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app
  .message('getMember', async (context) => {
    const thisTeam = await TeamsInfo.getMember(context, context.activity.from!.id!)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getTeamDetails', async (context) => {
    const thisTeam = await TeamsInfo.getTeamDetails(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getTeamChannels', async (context) => {
    const thisTeam = await TeamsInfo.getTeamChannels(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getMeetingInfo', async (context) => {
    const thisTeam = await TeamsInfo.getMeetingInfo(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getPagedMembers', async (context) => {
    const thisTeam = await TeamsInfo.getPagedMembers(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getTeamDetails', async (context) => {
    const thisTeam = await TeamsInfo.getTeamDetails(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('getMeetingInfo', async (context) => {
    const thisTeam = await TeamsInfo.getMeetingInfo(context)
    await context.sendActivity(`Hello ${JSON.stringify(thisTeam)}, I am your friendly bot!`)
  })
  .message('sendMessageToAllUsersInTeam', async (context) => {
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
    const teamId = teamsChannelData.team?.id
    const batchResp = await TeamsInfo.sendMessageToAllUsersInTeam(context, MessageFactory.text('msg from agent to all users in team'), context.adapter.authConfig.tenantId!, teamId!)
    console.log(batchResp.operationId)
  })
  .message('sendMessageToAllUsersInTenant', async (context) => {
    const batchResp = await TeamsInfo.sendMessageToAllUsersInTenant(context, MessageFactory.text('msg from agent to all users in team'), context.adapter.authConfig.tenantId!)
    console.log(batchResp.operationId)
  })

startServer(app)
