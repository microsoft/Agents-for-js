import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, loadAuthConfigFromEnv, TurnContext, TurnState, MsalTokenCredential } from '@microsoft/agents-hosting'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'

const echo = new AgentApplication<TurnState>({
  storage: new BlobsStorage('', undefined, undefined,
    'https://agentsstate.blob.core.windows.net/nodejs-conversations',
    new MsalTokenCredential(loadAuthConfigFromEnv()))
})
echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Blob sample, send a message to see the echo feature in action.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})

startServer(echo)
