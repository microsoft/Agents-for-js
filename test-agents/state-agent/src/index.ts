// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, ConversationState, UserState } from '@microsoft/agents-hosting'
import { BlobsStorage, BlobsTranscriptStore } from '@microsoft/agents-hosting-storage-blob'
// import { CosmosDbPartitionedStorage, CosmosDbPartitionedStorageOptions } from '@microsoft/agents-hosting-storage-cosmos'
import { StateManagementAgent } from './agent'

/* AZURE BLOB STORAGE - Uncomment the code in this section to use Azure blob storage */
const blobStorage = new BlobsStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const blobTranscriptStore = new BlobsTranscriptStore(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)
/* END AZURE BLOB STORAGE */

/* COSMOSDB STORAGE - Uncomment the code in this section to use CosmosDB storage */
// const cosmosDbStorageOptions = {
//   databaseId: process.env.COSMOS_DATABASE_ID || 'agentsDB',
//   containerId: process.env.COSMOS_CONTAINER_ID || 'agentsState',
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

const myAgent = new StateManagementAgent(conversationState, userState, blobTranscriptStore)
const authConfig: AuthConfiguration = loadAuthConfigFromEnv()
const adapter = new CloudAdapter(authConfig)

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myAgent.run(context))
})

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nServer listening to port ${port}`)
}).on('error', console.error)
