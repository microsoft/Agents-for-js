import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting'

const app = new AgentApplication<TurnState>({ startTypingTimer: false, longRunningMessages: false })

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  await setTimeout(() => { console.log('delay') }, 5000)
  await context.sendActivity(`You said: ${context.activity.text}`)
})

startServer(app)
