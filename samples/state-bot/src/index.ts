// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import rateLimit from 'express-rate-limit'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, ConversationState, UserState } from '@microsoft/agents-bot-hosting'
import { BlobsStorage, BlobsTranscriptStore } from '@microsoft/agents-bot-hosting-storage-blob'
// import { CosmosDbPartitionedStorage, CosmosDbPartitionedStorageOptions } from '@microsoft/agents-bot-hosting-storage-cosmos'
import { StateManagementBot } from './bot'

/* AZURE BLOB STORAGE - Uncomment the code in this section to use Azure blob storage */
const blobStorage = new BlobsStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const blobTranscriptStore = new BlobsTranscriptStore(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
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

// const memoryStorage = new MemoryStorage()
// const conversationState = new ConversationState(memoryStorage)
// const userState = new UserState(memoryStorage)

const myBot = new StateManagementBot(conversationState, userState, blobTranscriptStore)
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new CloudAdapter(authConfig)

const app = express()
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  validate: {
    xForwardedForHeader: false // Disabled for the sample
  }
})
app.use(limiter)

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myBot.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port}`)
})
