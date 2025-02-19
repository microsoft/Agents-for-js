// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'
import rateLimit from 'express-rate-limit'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, MemoryStorage, ConversationState, UserState } from '@microsoft/agents-bot-hosting'
import { ConversationReference } from '@microsoft/agents-bot-activity'

import { AdaptiveCardBot } from './adaptiveCardsBot'
import { CardFactoryBot } from './cardFactoryBot'
import { MultiFeatureBot } from './multiFeatureBot'
import { StateManagementBot } from './stateBot'
import { WebChatSsoBot } from './webChatSsoBot'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const conversationReferences: { [key: string]: ConversationReference } = {}

const createBot = (botName: string) => {
  switch (botName) {
    case 'AdaptiveCardBot':
      return new AdaptiveCardBot()
    case 'CardFactoryBot':
      return new CardFactoryBot()
    case 'MultiFeatureBot':
      return new MultiFeatureBot(conversationReferences)
    case 'WebChatSsoBot': {
      const memoryStorage = new MemoryStorage()
      const userState = new UserState(memoryStorage)
      return new WebChatSsoBot(userState)
    }
    case 'StateManagementBot': {
      /* AZURE BLOB STORAGE - Uncomment the code in this section to use Azure blob storage */
      // const blobStorage = new AzureBlobStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
      // const conversationState = new ConversationState(blobStorage)
      // const userState = new UserState(blobStorage)
      /* END AZURE BLOB STORAGE */

      /* COSMOSDB STORAGE - Uncomment the code in this section to use CosmosDB storage */
      // const cosmosDbStorageOptions = {
      //   databaseId: process.env.COSMOS_DATABASE_ID || 'botsDB',
      //   containerId: process.env.COSMOS_CONTAINER_ID || 'botState',
      //   cosmosClientOptions: {
      //     endpoint: process.env.COSMOS_ENDPOINT!,
      //     key: process.env.COSMOS_KEY!,
      //   }
      // } as CosmosDbPartitionedStorageOptions
      // const cosmosStorage = new CosmosDbPartitionedStorage(cosmosDbStorageOptions)
      // const conversationState = new ConversationState(cosmosStorage)
      // const userState = new UserState(cosmosStorage)
      /* END COSMOSDB STORAGE */
      const memoryStorage = new MemoryStorage()
      const conversationState = new ConversationState(memoryStorage)
      const userState = new UserState(memoryStorage)
      return new StateManagementBot(conversationState, userState)
    }
    default:
      throw new Error(`Bot with name ${botName} is not recognized.`)
  }
}

const adapter = new CloudAdapter(authConfig)

const botName = process.env.botName || 'MultiFeatureBot'
const myBot = createBot(botName)

const app = express()

app.use(rateLimit({ validate: { xForwardedForHeader: false } }))
app.use(express.json())
app.use(authorizeJWT(authConfig))

app.get('/api/notify', async (_req: Request, res: Response) => {
  for (const conversationReference of Object.values(conversationReferences)) {
    await adapter.continueConversation(conversationReference, async context => {
      await context.sendActivity('proactive hello')
    })
  }

  res.setHeader('Content-Type', 'text/html')
  res.writeHead(200)
  res.write('<html><body><h1>Proactive messages have been sent.</h1></body></html>')
  res.end()
})

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
