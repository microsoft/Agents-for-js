// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import express, { Response } from 'express'

import rateLimit from 'express-rate-limit'
import { Request, authorizeJWT, AuthConfiguration, loadAuthConfigFromEnv, TurnState, TurnContext, CloudAdapter, Application }
  from '@microsoft/agents-bot-hosting'
import { ActivityTypes } from '@microsoft/agents-bot-activity'
import { BlobsStorage, BlobsTranscriptStore } from '@microsoft/agents-bot-hosting-storage-blob'

const authConfig: AuthConfiguration = loadAuthConfigFromEnv()

const adapter = new CloudAdapter(authConfig)

const server = express()

server.use(rateLimit({ validate: { xForwardedForHeader: false } }))
server.use(express.json())
server.use(authorizeJWT(authConfig))

const blobStorage = new BlobsStorage(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)
const blobTranscriptStore = new BlobsTranscriptStore(process.env.BLOB_STORAGE_CONNECTION_STRING!, process.env.BLOB_CONTAINER_ID!)

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
const storage = blobStorage
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

      if (turnContext.activity.text === 'show transcript') {
        await showTranscript(turnContext)
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

async function showTranscript (turnContext: TurnContext) {
  if (!turnContext.activity.conversation) {
    await turnContext.sendActivity('Conversation ID is undefined.')
    return
  }
  const conversationId = turnContext.activity.conversation.id

  // Query the transcript for the current conversation
  const pagedTranscript = await blobTranscriptStore.getTranscriptActivities(
    turnContext.activity.channelId || '',
    conversationId
  )

  if (pagedTranscript.items.length > 0) {
    const activities = pagedTranscript.items.map(activity => {
      const timestamp = activity.timestamp ? activity.timestamp.toLocaleString() : 'Unknown time'
      const sender = activity.from?.id || 'Unknown sender'
      const messageText = activity.text || 'No message content'
      return `At ${timestamp}: ${sender} said "${messageText}"`
    }).join('\n')

    await turnContext.sendActivity(`Transcript:\n${activities}`)
  } else {
    await turnContext.sendActivity('No transcript found for this conversation.')
  }
}
