import { ActivityHandler, AgentClient, UserState, ConversationState, AgentStatePropertyAccessor, TurnContext, AuthConfiguration } from '@microsoft/agents-hosting'
import { version as sdkVersion } from '@microsoft/agents-hosting/package.json'
import { ConversationData, UserProfile } from './state'
import { ConversationReference } from '@microsoft/agents-activity'

export class RootHandlerWithBlobStorageMemory extends ActivityHandler {
  conversationState: ConversationState
  userState: UserState
  conversationDataAccessor: AgentStatePropertyAccessor<ConversationData>
  userProfileAccessor: AgentStatePropertyAccessor<UserProfile>
  private authConfig: AuthConfiguration

  constructor (
    conversationState: ConversationState,
    userState: UserState,
    conversationDataAccessor: AgentStatePropertyAccessor<ConversationData>,
    userProfileAccessor: AgentStatePropertyAccessor<UserProfile>,
    authConfig: AuthConfiguration
  ) {
    super()

    this.conversationState = conversationState
    this.userState = userState
    this.conversationDataAccessor = conversationDataAccessor
    this.userProfileAccessor = userProfileAccessor
    this.authConfig = authConfig

    this.onMessage(async (context, next) => {
      const userProfile = await this.userProfileAccessor.get(context, {})
      const conversationData = await this.conversationDataAccessor.get(context, { nameRequested: false, conversationReference: {} as ConversationReference })
      if (!userProfile.name) {
        if (conversationData.nameRequested && !context.activity.text?.startsWith('agent:')) {
          userProfile.name = context.activity.text
          await context.sendActivity(`Thanks ${userProfile.name}. You are now talking with the echo-agent. Type end or stop to finish the conversation.`)
        } else {
          await context.sendActivity('Type your name to start talking with the echo-agent. Type end or stop to finish the conversation.')
          conversationData.nameRequested = true
        }
      } else {
        const agentClient: AgentClient = new AgentClient('Agent1')

        const activityStarts = JSON.stringify(context.activity)
        console.log('activityStarts', activityStarts)

        context.activity.text = `${userProfile.name}: ${context.activity.text}`
        await agentClient.postActivity(context.activity, this.authConfig, this.conversationState, context)
      }

      await next()
    })

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded ?? []
      for (const member of membersAdded) {
        if (member.id !== (context.activity.recipient?.id ?? '')) {
          await context.sendActivity(`Root Agent running on sdk ${sdkVersion}`)
        }
      }
      await next()
    })

    this.onEndOfConversation(async (context, next) => {
      const conversationData = await this.conversationDataAccessor.get(context, { nameRequested: false, conversationReference: {} as ConversationReference })
      const userProfile = await this.userProfileAccessor.get(context, {})
      conversationData.nameRequested = false

      await context.sendActivity(`${userProfile.name} ended the conversation`)

      await this.conversationDataAccessor.delete(context)
      await this.userProfileAccessor.delete(context)
      await this.conversationState.saveChanges(context, false)
      await this.userState.saveChanges(context, false)

      await next()
    })
  }

  async run (context: TurnContext) {
    await super.run(context)

    await this.conversationState.saveChanges(context, false)
    await this.userState.saveChanges(context, false)
  }
}
