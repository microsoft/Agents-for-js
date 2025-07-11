import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, loadAuthConfigFromEnv, TurnContext, TurnState, MsalTokenCredential, CloudAdapter } from '@microsoft/agents-hosting'
import { BlobsStorage, BlobsTranscriptStore } from '@microsoft/agents-hosting-storage-blob'

const transcriptLogger = new BlobsTranscriptStore(
  '', '', undefined,
  'https://asdktdata.blob.core.windows.net/transcripts',
  new MsalTokenCredential(loadAuthConfigFromEnv('blob')))

const storage = new BlobsStorage(
  '', undefined, undefined,
  'https://asdktdata.blob.core.windows.net/nodejs-conversations',
  new MsalTokenCredential(loadAuthConfigFromEnv('blob')))

const adapter = new CloudAdapter(loadAuthConfigFromEnv())

const agent = new AgentApplication({ adapter, transcriptLogger, storage, startTypingTimer: true })

agent.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Blob sample, send a message to see the echo feature in action.')
})
agent.onMessage('list', async (context: TurnContext) => {
  const activity = context.activity
  const transcripts = await transcriptLogger.getTranscriptActivities(activity.channelId ?? '', activity.conversation?.id ?? '')
  await context.streamingResponse.queueInformativeUpdate('This is the list of logged transcripts:')
  for (const activity of transcripts.items) {
    await context.streamingResponse.queueTextChunk(`${activity.from?.name}> ${activity.text ?? 'no text'} \n \n`)
  }
  await context.streamingResponse.endStream()
})
agent.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})

startServer(agent)
