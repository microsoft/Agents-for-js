import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Activity, ActivityTypes } from '@microsoft/agents-activity'

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

const agent = new AgentApplication<TurnState>()

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Streaming sample, send a message to see the echo feature in action.')
})

agent.onActivity('invoke', async (context: TurnContext, state: TurnState) => {
  const invokeResponse = Activity.fromObject({
    type: ActivityTypes.InvokeResponse,
    value: {
      status: 200,
    }
  })
  await context.sendActivity(invokeResponse)
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  context.streamingResponse.setFeedbackLoop(true)
  context.streamingResponse.setGeneratedByAILabel(true)
  context.streamingResponse.setSensitivityLabel({ type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'Internal' })
  await context.streamingResponse.queueInformativeUpdate('starting streaming response')
  await sleep(1000)
  for (let i = 0; i < 2; i++) {
    console.log(`Streaming chunk ${i + 1}`)
    await context.streamingResponse.queueTextChunk(`part ${i + 1}`)
    await sleep(1000)
  }
  await context.streamingResponse.endStream()
})

startServer(agent)
