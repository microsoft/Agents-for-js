import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'

interface SubmitData extends Record<string, unknown> {}

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension<TurnState>(app)

app.registerExtension<TeamsAgentExtension<TurnState>>(teamsExt, (tae) => {
  console.log('Teams extension registered')
  tae.taskModule.submit<SubmitData>('do', async (context: TurnContext, state: TurnState, data: SubmitData) => {
    console.log('Task module submit:', data)
    await context.sendActivity('Task module submitted successfully!')
    return undefined
  })
})

app.onActivity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''
  console.log('Received message:', text)

  state.setValue('user.lastMessage', text)

  await context.sendActivity(`I received your message in Teams: "${text}". Try adding a reaction!`)
})

startServer(app)
