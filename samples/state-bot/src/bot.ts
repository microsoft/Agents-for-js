// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ActivityHandler, ConversationState, TurnContext, UserState, BotStatePropertyAccessor } from '@microsoft/agents-bot-hosting'
import { BlobsTranscriptStore } from '@microsoft/agents-bot-hosting-storage-blob'

interface ConversationData {
  promptedForUserName: boolean;
  timestamp?: string;
  channelId?: string;
}

interface UserProfile {
  name?: string;
}

export class StateManagementBot extends ActivityHandler {
  conversationState: ConversationState
  userState: UserState
  conversationDataAccessor: BotStatePropertyAccessor<ConversationData>
  userProfileAccessor: BotStatePropertyAccessor<UserProfile>
  transcriptStore: BlobsTranscriptStore

  constructor (conversationState: ConversationState, userState: UserState, transcriptStore: BlobsTranscriptStore) {
    super()
    this.conversationDataAccessor = conversationState.createProperty<ConversationData>('conversationData')
    this.userProfileAccessor = userState.createProperty<UserProfile>('userProfile')

    this.conversationState = conversationState
    this.userState = userState

    // Reference the transcript store
    this.transcriptStore = transcriptStore

    this.onMessage(async (turnContext, next) => {
      try {
        const userProfile = await this.userProfileAccessor.get(turnContext, {})
        console.log('User Profile:', userProfile)

        const conversationData = await this.conversationDataAccessor.get(turnContext, { promptedForUserName: false })
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
            await this.conversationDataAccessor.delete(turnContext)
            await this.userProfileAccessor.delete(turnContext)
          }
        }

        if (turnContext.activity.text === 'show transcript') {
          await this.showTranscript(turnContext)
        }
      } catch (error) {
        console.error('State accessor error:', error)
        await turnContext.sendActivity('Sorry, there was an error processing your message.')
      }

      await next()
    })

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded!
      for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
        if (membersAdded[cnt].id !== context.activity.recipient!.id) {
          await context.sendActivity('Welcome to State Bot Sample. Type anything to get started.')
        }
      }

      await next()
    })
  }

  async showTranscript (turnContext: TurnContext) {
    if (!turnContext.activity.conversation) {
      await turnContext.sendActivity('Conversation ID is undefined.')
      return
    }
    const conversationId = turnContext.activity.conversation.id

    // Query the transcript for the current conversation
    const pagedTranscript = await this.transcriptStore.getTranscriptActivities(
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

  async run (context: TurnContext) {
    await super.run(context)

    await this.conversationState.saveChanges(context, false)
    await this.userState.saveChanges(context, false)
    await this.transcriptStore.logActivity(context.activity)
  }
}
