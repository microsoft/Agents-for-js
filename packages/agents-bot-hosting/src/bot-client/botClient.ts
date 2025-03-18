import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { Activity, RoleTypes } from '@microsoft/agents-bot-activity'
import { MemoryStorage, StoreItem } from '../storage'
import { v4 } from 'uuid'

export interface BotClientConfig {
  botEndPoint: string
  botId: string
  serviceUrl: string
}

export class BotClient {
  botClientConfig: BotClientConfig

  public constructor (botConfigKey: string) {
    this.botClientConfig = this.loadBotClientConfig(botConfigKey)
  }

  public async postActivity (activity: Activity, authConfig: AuthConfiguration): Promise<string> {
    const activityCopy = JSON.parse(JSON.stringify(activity)) as Activity
    activityCopy.serviceUrl = this.botClientConfig.serviceUrl
    activityCopy.recipient = { ...activityCopy.recipient, role: RoleTypes.Skill }
    activityCopy.relatesTo = {
      serviceUrl: activity.serviceUrl,
      activityId: activityCopy.id,
      channelId: activityCopy.channelId!,
      locale: activityCopy.locale,
      conversation: {
        id: activity.conversation!.id,
        name: activityCopy.conversation!.name,
        conversationType: activityCopy.conversation!.conversationType,
        aadObjectId: activityCopy.conversation!.aadObjectId,
        isGroup: activityCopy.conversation!.isGroup,
        properties: activityCopy.conversation!.properties,
        role: activityCopy.conversation!.role,
        tenantId: activityCopy.conversation!.tenantId
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
    console.log('memoryChanges', memoryChanges)

    const authProvider = new MsalTokenProvider()
    const token = await authProvider.getAccessToken(authConfig, this.botClientConfig.botId)

    const activityToEchoBot = JSON.stringify(activityCopy)
    console.log('activityToEchoBot', activityToEchoBot)

    const response = await fetch(this.botClientConfig.botEndPoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'x-ms-conversation-id': activityCopy.conversation!.id
      },
      body: JSON.stringify(activityCopy)
    })
    if (!response.ok) {
      throw new Error(`Failed to post activity to bot: ${response.statusText}`)
    }
    return response.statusText
  }

  private loadBotClientConfig (botName: string): BotClientConfig {
    if (botName) {
      if (process.env[`${botName}_endpoint`] !== undefined &&
          process.env[`${botName}_clientId`] !== undefined &&
          process.env[`${botName}_serviceUrl`] !== undefined) {
        return {
          botEndPoint: process.env[`${botName}_endpoint`]!,
          botId: process.env[`${botName}_clientId`]!,
          serviceUrl: process.env[`${botName}_serviceUrl`]!
        }
      } else {
        throw new Error(`Missing bot client config for bot ${botName}`)
      }
    } else {
      throw new Error('Bot name is required')
    }
  }
}
