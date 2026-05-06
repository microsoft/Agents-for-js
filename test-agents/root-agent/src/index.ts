// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'
import rateLimit from 'express-rate-limit'
import { Request, CloudAdapter, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, configureResponseController, UserState, ConversationState } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'
import { RootHandlerWithBlobStorageMemory } from './agent'
import { BlobsStorage } from '@microsoft/agents-hosting-storage-blob'
import { ConversationData, UserProfile } from './state'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const blobStorage = new BlobsStorage(process.env.BLOB_CONTAINER_ID!, process.env.BLOB_STORAGE_CONNECTION_STRING!)
const conversationState = new ConversationState(blobStorage)
const userState = new UserState(blobStorage)

const adapter = new CloudAdapter(authConfig)

const conversationDataAccessor = conversationState.createProperty<ConversationData>('conversationData')
const userProfileAccessor = userState.createProperty<UserProfile>('userProfile')
const myAgent = new RootHandlerWithBlobStorageMemory(conversationState, userState, conversationDataAccessor, userProfileAccessor, authConfig)

const app = express()

app.use(express.json())

const messagesRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100
})

app.post('/api/messages', messagesRateLimiter, authorizeJWT(authConfig), async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => await myAgent.run(context))
})

app.use('/api/agentresponse', messagesRateLimiter, authorizeJWT(authConfig))
configureResponseController(app, adapter, myAgent, conversationState)

const port = process.env.PORT || 3978
app.listen(port, () => {
  console.log(`\nRootBot to port ${port} on sdk ${sdkVersion} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
