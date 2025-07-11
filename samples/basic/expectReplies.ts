import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, CloudAdapter, loadAuthConfigFromEnv, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { DeliveryModes } from '@microsoft/agents-activity'

const adapter = new CloudAdapter(loadAuthConfigFromEnv())
// Patch process to log the invokeResponse sent to the client
const originalProcess = adapter.process.bind(adapter)
adapter.process = async (req, res, logic) => {
  let responseLogged = false
  const originalSend = res.send.bind(res)
  res.send = function (body) {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body
      if (!responseLogged) {
        // res.send is called more than one time per request, but we want to log the invokeResponse only once
        console.log('Intercepted invokeResponse:', JSON.stringify(parsed, null, 2))
        responseLogged = true
      }
    } catch {
      if (!responseLogged) {
        console.log('Intercepted invokeResponse (raw):', body)
        responseLogged = true
      }
    }
    return originalSend(body)
  }
  try {
    await originalProcess(req, res, logic)
  } finally {
    res.send = originalSend
    responseLogged = false
  }
}

const agent = new AgentApplication<TurnState>({ adapter, storage: new MemoryStorage() })

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the ExpectReplies sample!')
  await context.sendActivity('Send a message and check the logs to see the reply with multiple activities in the request response.')
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  // Set delivery mode to expectReplies for demonstration
  context.activity.deliveryMode = DeliveryModes.ExpectReplies

  // Send multiple replies in a single turn
  await context.sendActivity(`You said: ${context.activity.text}`)
  await context.sendActivity(`Echo: ${context.activity.text?.toUpperCase()}`)
  await context.sendActivity(`Length: ${context.activity.text?.length}`)
})

startServer(agent)
