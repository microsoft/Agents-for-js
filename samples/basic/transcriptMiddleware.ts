/*
 **********************************************************************************************************
 * This sample requires the Storage emulator to be running or an Azure Storage account connection string.
 **********************************************************************************************************
 */

import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, CloudAdapter, loadAuthConfigFromEnv, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { BlobsTranscriptStore } from '@microsoft/agents-hosting-storage-blob'

const logger: BlobsTranscriptStore = new BlobsTranscriptStore(
  'UseDevelopmentStorage=true', // or your Azure Storage connection string
  'transcripts') // container name

const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const agent = new AgentApplication({ adapter, transcriptLogger: logger })

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the TranscriptMiddleware sample, send "list" to see the logged transcripts and "delete" to clean up the list.')
})

agent.onMessage('list', async (context: TurnContext) => {
  const activity = context.activity
  const transcripts = await logger.getTranscriptActivities(activity.channelId ?? '', activity.conversation?.id ?? '')
  await context.sendActivity('This is the list of logged transcripts:')
  for (const activity of transcripts.items) {
    await context.sendActivity(`Type: ${activity.type}, Text: ${activity.text ?? 'no text'}`)
  }
})

agent.onMessage('delete', async (context: TurnContext) => {
  logger.deleteTranscript(context.activity.channelId ?? '', context.activity.conversation?.id ?? '')
  await context.sendActivity('Transcripts deleted!')
})

agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})

startServer(agent)
