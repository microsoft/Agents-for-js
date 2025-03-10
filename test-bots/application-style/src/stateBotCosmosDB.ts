// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import rateLimit from 'express-rate-limit'
import { Request, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, TurnState, TurnContext, CloudAdapter, Application }
  from '@microsoft/agents-bot-hosting'
import { ActivityTypes } from '@microsoft/agents-bot-activity'
import { CosmosDbPartitionedStorage, CosmosDbPartitionedStorageOptions } from '@microsoft/agents-bot-hosting-storage-cosmos'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)

const server = express()

server.use(rateLimit({ validate: { xForwardedForHeader: false } }))
server.use(express.json())
server.use(authorizeJWT(authConfig))

const cosmosDbStorageOptions = {
  databaseId: process.env.COSMOS_DATABASE_ID || 'botsDB',
  containerId: process.env.COSMOS_CONTAINER_ID || 'botState',
  cosmosClientOptions: {
    endpoint: process.env.COSMOS_ENDPOINT!,
    key: process.env.COSMOS_KEY!,
  }
} as CosmosDbPartitionedStorageOptions
const cosmosStorage = new CosmosDbPartitionedStorage(cosmosDbStorageOptions)

interface ConversationData {
  promptedForUserName: boolean;
  timestamp?: string;
  channelId?: string;
}

interface UserProfile {
  name?: string;
}

type ApplicationTurnState = TurnState<ConversationData, UserProfile>

// Define storage and application
const storage = cosmosStorage
const app = new Application<ApplicationTurnState>({
  storage
})

// Listen for ANY message to be received. MUST BE AFTER ANY OTHER MESSAGE HANDLERS
app.activity(ActivityTypes.Message, async (turnContext: TurnContext, state: ApplicationTurnState) => {
  try {
    const userProfile = state.user
    console.log('User Profile:', userProfile)

    const conversationData = state.conversation
    console.log('Conversation Data:', conversationData)
    if (!userProfile.name) {
      if (conversationData.promptedForUserName) {
        userProfile.name = turnContext.activity.text

        await turnContext.sendActivity(`Thanks ${userProfile.name}. To see conversation data, type anything.`)

        conversationData.promptedForUserName = false
      } else {
        await turnContext.sendActivity('What is your name?')
        conversationData.promptedForUserName = true
      }
    } else {
      conversationData.timestamp = turnContext.activity.timestamp!.toLocaleString()
      conversationData.channelId = turnContext.activity.channelId

      await turnContext.sendActivity(`${userProfile.name} sent: ${turnContext.activity.text}`)

      if (turnContext.activity.text === '/reset') {
        state.deleteConversationState()
        state.deleteUserState()
      }
    }
  } catch (error) {
    console.error('State accessor error:', error)
    await turnContext.sendActivity('Sorry, there was an error processing your message.')
  }
})

app.conversationUpdate('membersAdded', async (context: TurnContext, state: ApplicationTurnState) => {
  await state.load(context, storage)
  const membersAdded = context.activity.membersAdded!
  for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
    if (membersAdded[cnt].id !== context.activity.recipient!.id) {
      await context.sendActivity('Welcome to State Bot Sample. Type anything to get started.')
    }
  }
})

server.post('/api/messages', async (req: Request, res: Response) => {
  await adapter.process(req, res, async (context) => {
    await app.run(context)
  })
})

const port = process.env.PORT || 3978
server.listen(port, () => {
  console.log(`\nServer listening to port ${port} for appId ${authConfig.clientId} debug ${process.env.DEBUG}`)
})
