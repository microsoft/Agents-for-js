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
  console.log('Received invoke activity:', context.activity)
  await context.sendActivity(invokeResponse)
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  context.streamingResponse.setDelayInMs(500)
  context.streamingResponse.setFeedbackLoop(true)
  context.streamingResponse.setSensitivityLabel({ type: 'https://schema.org/Message', '@type': 'CreativeWork', name: 'Internal' })
  context.streamingResponse.setGeneratedByAILabel(true)
  await context.streamingResponse.queueInformativeUpdate('starting streaming response')
  await sleep(1000)
  for (let i = 0; i < 5; i++) {
    console.log(`Streaming chunk ${i + 1}`)
    await context.streamingResponse.queueTextChunk(`part [${i + 1}] `)
    await sleep(i * 500)
  }
  await context.streamingResponse.queueTextChunk('This is the last part of the streaming response. [doc1] and [doc2]')
  await context.streamingResponse.setCitations([
    { title: 'Citation1', content: 'file', filepath: '', url: 'file:////' },
    { title: 'Citation2', content: 'loooonger content', filepath: '', url: 'file:////' }])
  await context.streamingResponse.endStream()
})

startServer(agent)
