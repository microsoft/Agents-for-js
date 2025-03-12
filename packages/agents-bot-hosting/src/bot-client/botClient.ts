import { Activity, RoleTypes } from '@microsoft/agents-bot-activity'
import { BotClientConfig } from './botClientConfig'
// import { v4 } from 'uuid'
import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { v4 } from 'uuid'
import { MemoryStorage, StoreItem } from '../storage'

export const PostActivity = async (activity: Activity, botClientConfig: BotClientConfig, authConfig: AuthConfiguration): Promise<string> => {
  const activityCopy = JSON.parse(JSON.stringify(activity)) as Activity
  activityCopy.serviceUrl = botClientConfig.serviceUrl
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
  const token = await authProvider.getAccessToken(authConfig, botClientConfig.botId)

  const activityToEchoBot = JSON.stringify(activityCopy)
  console.log('activityToEchoBot', activityToEchoBot)

  const response = await fetch(botClientConfig.botEndPoint, {
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
