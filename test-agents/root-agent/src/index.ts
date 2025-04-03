// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, configureResponseController, UserState, ConversationState } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'
import { RootHandlerWithBlobStorageMemory } from './agent'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'
import { ConversationData, UserProfile } from './conversationState'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const blobStorage = new BlobsStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)

const adapter = new CloudAdapter(authConfig)

const conversationDataAccessor = conversationState.createProperty<ConversationData>('conversationData')
const userProfileAccessor = userState.createProperty<UserProfile>('userProfile')
const myAgent = new RootHandlerWithBlobStorageMemory(conversationState, userState, conversationDataAccessor, userProfileAccessor)

const app = express()

app.use(express.json())
app.use(authorizeJWT(authConfig))

app.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myAgent.run(context))
})

configureResponseController(app, adapter, myAgent, conversationState)

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nRootBot to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
