import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { MyTeamsExt } from '@microsoft/agents-hosting-extensions-teams'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

const myTeamsExt = new MyTeamsExt(app)

app.registerExtension<MyTeamsExt>(myTeamsExt, (tae) => {
  console.log('MyTeamsExt registered')
})

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})
app.activity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})
startServer(app)
