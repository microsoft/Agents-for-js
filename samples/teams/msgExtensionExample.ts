import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { TeamsAgentExtension } from '@microsoft/agents-hosting-extensions-teams'
import { startServer } from '@microsoft/agents-hosting-express'
import { MessagingExtensionQuery, MessagingExtensionResult } from '@microsoft/agents-hosting-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const teamsExt = new TeamsAgentExtension(app)

app.registerExtension<TeamsAgentExtension>(teamsExt, (tae) => {
  console.log('Teams extension registered')

  tae.messageExtension.onQuery(async (context: TurnContext, state: TurnState, query: MessagingExtensionQuery) : Promise<MessagingExtensionResult> => {
    console.log('Received message extension query:', query)
    return {
      attachmentLayout: 'list',
      type: 'result',
    }
  })
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  const text = context.activity.text || ''
  console.log('Received message:', text)

  state.setValue('user.lastMessage', text)

  await context.sendActivity(`I received your message in Teams: "${text}". Try adding a reaction!`)
})

startServer(app)
