// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { startServer } from '@microsoft/agents-hosting-express'
import { ActivityHandler, ConversationState, TurnContext, UserState, AgentStatePropertyAccessor, MemoryStorage, Storage } from '@microsoft/agents-hosting'

interface ConversationData {
  promptedForUserName: boolean;
  timestamp?: string;
  channelId?: string;
}

interface UserProfile {
  name?: string;
}

export class StateManagementHandler extends ActivityHandler {
  conversationState: ConversationState
  userState: UserState
  conversationDataAccessor: AgentStatePropertyAccessor<ConversationData>
  userProfileAccessor: AgentStatePropertyAccessor<UserProfile>

  constructor (storage: Storage) {
    super()

    this.conversationState = new ConversationState(storage)
    this.userState = new UserState(storage)

    this.conversationDataAccessor = this.conversationState.createProperty<ConversationData>('conversationData')
    this.userProfileAccessor = this.userState.createProperty<UserProfile>('userProfile')

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
          await context.sendActivity('Welcome to State Sample. Type anything to get started.')
        }
      }

      await next()
    })
  }

  async run (context: TurnContext) {
    await super.run(context)

    await this.conversationState.saveChanges(context, false)
    await this.userState.saveChanges(context, false)
  }
}
startServer(new StateManagementHandler(new MemoryStorage()))
