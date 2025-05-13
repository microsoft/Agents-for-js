import { AgentApplication, CloudAdapter, loadAuthConfigFromEnv, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { startServer } from '@microsoft/agents-hosting-express'

const adapter = new CloudAdapter(loadAuthConfigFromEnv())
const app = new AgentApplication<TurnState>({ startTypingTimer: true, longRunningMessages: true, adapter })

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
  // await context.sendActivity(`You said1: ${context.activity.text}`)
  await sleep(5000)
  await context.sendActivity(`You said2: ${context.activity.text}`)
})

startServer(app)
