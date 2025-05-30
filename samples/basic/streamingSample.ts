import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity } from '@microsoft/agents-activity'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const agent = new AgentApplication<TurnState>({ storage: new MemoryStorage() })
agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Streaming sample, send a message to see the echo feature in action.')
})
agent.onActivity('invoke', async (context: TurnContext, state: TurnState) => {
  const invokeResponse = Activity.fromObject({
    type: 'invokeResponse',
    value: {
      status: 200,
      body: {
        message: 'invoke response received'
      }
    }
  })
  await context.sendActivity(invokeResponse)
})
agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  context.streamingResponse.setFeedbackLoop(true)
  context.streamingResponse.setGeneratedByAILabel(true)
  await context.streamingResponse.queueInformativeUpdate('starting streaming response')
  await sleep(1000)
  for (let i = 0; i < 5; i++) {
    console.log(`Streaming chunk ${i + 1}`)
    await context.streamingResponse.queueTextChunk(`part ${i + 1}`)
    await sleep(1000)
  }
  await context.streamingResponse.endStream()
})

startServer(agent)
