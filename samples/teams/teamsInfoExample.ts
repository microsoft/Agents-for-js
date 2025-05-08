import { AgentApplication, MemoryStorage, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'
import { TeamsInfo } from '@microsoft/agents-hosting-extensions-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.message('teams', async (context) => {
  const thisTeam = await TeamsInfo.getMember(context, context.activity.from!.id!)
  await context.sendActivity(`Hello ${thisTeam}, I am your friendly bot!`)
})

startServer(app)
