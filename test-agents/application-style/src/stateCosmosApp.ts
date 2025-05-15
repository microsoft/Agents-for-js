// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TurnState, TurnContext, AgentApplication } from '@microsoft/agents-hosting'
import { ActivityTypes } from '@microsoft/agents-activity'
import { CosmosDbPartitionedStorage, CosmosDbPartitionedStorageOptions } from '@microsoft/agents-hosting-storage-cosmos'

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
export const app = new AgentApplication<ApplicationTurnState>({
  storage
})

// Listen for ANY message to be received. MUST BE AFTER ANY OTHER MESSAGE HANDLERS
app.onActivity(ActivityTypes.Message, async (turnContext: TurnContext, state: ApplicationTurnState) => {
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
      await context.sendActivity('Welcome to State Agent Sample. Type anything to get started.')
    }
  }
})
