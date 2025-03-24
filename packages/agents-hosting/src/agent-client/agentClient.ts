import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { Activity, RoleTypes } from '@microsoft/agents-activity'
import { MemoryStorage, StoreItem } from '../storage'
import { v4 } from 'uuid'
import { debug } from '../logger'

const logger = debug('agents:agent-client')

export interface AgentClientConfig {
  endPoint: string
  clientId: string
  serviceUrl: string
}

export class AgentClient {
  agentClientConfig: AgentClientConfig

  public constructor (agentConfigKey: string) {
    this.agentClientConfig = this.loadAgentClientConfig(agentConfigKey)
  }

  public async postActivity (activity: Activity, authConfig: AuthConfiguration): Promise<string> {
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

    const memory = MemoryStorage.getSingleInstance()
    const changes: StoreItem = {} as StoreItem
    changes[activityCopy.conversation!.id] = {
      conversationReference: activity.getConversationReference()
    }
    await memory.write(changes)

    const memoryChanges = JSON.stringify(changes)
    logger.debug('memoryChanges: ', memoryChanges)

    const authProvider = new MsalTokenProvider()
    const token = await authProvider.getAccessToken(authConfig, this.agentClientConfig.clientId)

    logger.debug('agent request: ', activityCopy)

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
