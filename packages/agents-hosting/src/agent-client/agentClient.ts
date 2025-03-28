import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { Activity, ConversationReference, RoleTypes } from '@microsoft/agents-activity'
import { v4 } from 'uuid'
import { debug } from '../logger'
import { ConversationState } from '../state'
import { TurnContext } from '../turnContext'

const logger = debug('agents:agent-client')

export interface AgentClientConfig {
  endPoint: string
  clientId: string
  serviceUrl: string
}

export interface ConversationData {
  nameRequested: boolean
  conversationReference: ConversationReference
}

export class AgentClient {
  agentClientConfig: AgentClientConfig

  public constructor (agentConfigKey: string) {
    this.agentClientConfig = this.loadAgentClientConfig(agentConfigKey)
  }

  public async postActivity (activity: Activity, authConfig: AuthConfiguration, conversationState: ConversationState, context: TurnContext): Promise<string> {
    const activityCopy = activity.clone()
    activityCopy.serviceUrl = this.agentClientConfig.serviceUrl
    activityCopy.recipient = { ...activityCopy.recipient, role: RoleTypes.Skill }
    activityCopy.relatesTo = {
      serviceUrl: activity.serviceUrl,
      activityId: activityCopy.id,
      channelId: activityCopy.channelId!,
      locale: activityCopy.locale,
      conversation: {
        id: activity.conversation!.id,
        ...activityCopy.conversation
      }
    }
    activityCopy.conversation!.id = v4()

    const conversationDataAccessor = conversationState.createProperty<ConversationData>(activityCopy.conversation!.id)
    const convRef = await conversationDataAccessor.set(context,
      { conversationReference: activity.getConversationReference(), nameRequested: false },
      { channelId: activityCopy.channelId!, conversationId: activityCopy.conversation!.id }
    )

    const stateChanges = JSON.stringify(convRef)
    logger.debug('stateChanges: ', stateChanges)

    const authProvider = new MsalTokenProvider()
    const token = await authProvider.getAccessToken(authConfig, this.agentClientConfig.clientId)

    logger.debug('agent request: ', activityCopy)

    await conversationState.saveChanges(context, false, { channelId: activityCopy.channelId!, conversationId: activityCopy.conversation!.id })
    const response = await fetch(this.agentClientConfig.endPoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-ms-conversation-id': activityCopy.conversation!.id
      },
      body: JSON.stringify(activityCopy)
    })
    if (!response.ok) {
      await conversationDataAccessor.delete(context, { channelId: activityCopy.channelId!, conversationId: activityCopy.conversation!.id })
      throw new Error(`Failed to post activity to agent: ${response.statusText}`)
    }
    return response.statusText
  }

  private loadAgentClientConfig (agentName: string): AgentClientConfig {
    if (agentName) {
      if (process.env[`${agentName}_endpoint`] !== undefined &&
        process.env[`${agentName}_clientId`] !== undefined &&
        process.env[`${agentName}_serviceUrl`] !== undefined) {
        return {
          endPoint: process.env[`${agentName}_endpoint`]!,
          clientId: process.env[`${agentName}_clientId`]!,
          serviceUrl: process.env[`${agentName}_serviceUrl`]!
        }
      } else {
        throw new Error(`Missing agent client config for agent ${agentName}`)
      }
    } else {
      throw new Error('Agent name is required')
    }
  }
}
