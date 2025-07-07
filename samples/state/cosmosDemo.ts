import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, loadAuthConfigFromEnv, TurnContext, TurnState, MsalTokenCredential } from '@microsoft/agents-hosting'
import { CosmosDbPartitionedStorage } from '@microsoft/agents-hosting-storage-cosmos'
import { RequestInfo } from '@azure/cosmos'

const msalTokenCosmosProvider = async (req: RequestInfo) : Promise<string> => {
  const tokenCredential = new MsalTokenCredential(loadAuthConfigFromEnv())
  const tokenResp = await tokenCredential.getToken(['https://cosmos.azure.com/'], undefined)
  return tokenResp.token
}

const echo = new AgentApplication<TurnState>({
  storage: new CosmosDbPartitionedStorage({
    databaseId: process.env.COSMOS_DATABASE_ID || 'conversations',
    containerId: process.env.COSMOS_CONTAINER_ID || 'activities',
    cosmosClientOptions: {
      endpoint: process.env.COSMOS_ENDPOINT || 'https://agentcosmos.documents.azure.com/',
      // key: process.env.COSMOS_KEY || 'id',
      tokenProvider: msalTokenCosmosProvider,
      aadCredentials: new MsalTokenCredential(loadAuthConfigFromEnv()),
    }
  })
})
echo.onConversationUpdate('membersAdded', async (context: TurnContext) => {
  await context.sendActivity('Welcome to the Cosmos sample, send a message to see the echo feature in action.')
})
echo.onActivity('message', async (context: TurnContext, state: TurnState) => {
  let counter: number = state.getValue('conversation.counter') || 0
  await context.sendActivity(`[${counter++}]You said: ${context.activity.text}`)
  state.setValue('conversation.counter', counter)
})

startServer(echo)
