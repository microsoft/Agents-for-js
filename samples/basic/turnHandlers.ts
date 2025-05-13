import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'

const app = new AgentApplication<TurnState>({ storage: new MemoryStorage() })

app.turn('beforeTurn', (_) => {
  console.log('Before turn event triggered')
  return Promise.resolve(true)
})

app.turn('afterTurn', (_) => {
  console.log('After turn event triggered')
  return Promise.resolve(true)
})

app.error(async (context: TurnContext, error: Error) => {
  console.error('Error occurred:', error)
  await context.sendActivity('An error occurred while processing your request.' + error.message)
})

app.conversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Echo sample, send a message to see the echo feature in action.')
})

app.message('fail', async (context: TurnContext) => {
  throw new Error('This is a test error')
})

app.activity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})
startServer(app)
