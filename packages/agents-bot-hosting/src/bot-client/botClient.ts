import { Activity, RoleTypes } from '@microsoft/agents-bot-activity'
import { BotClientConfig } from './botClientConfig'
// import { v4 } from 'uuid'
import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { v4 } from 'uuid'
import { MemoryStorage, StoreItem } from '../storage'

export const PostActivity = async (activity: Activity, botClientConfig: BotClientConfig, authConfig: AuthConfiguration): Promise<unknown> => {
  const activityCopy = { ...activity }
  activityCopy.serviceUrl = botClientConfig.serviceUrl
  activityCopy.recipient = { role: RoleTypes.Skill }
  activityCopy.relatesTo = activity.getConversationReference()

  activityCopy.conversation!.id = v4()

  const memory = MemoryStorage.getSingleInstance()
  const changes: StoreItem = {} as StoreItem
  changes[activityCopy.conversation!.id] = {
    conversationReference: activity.getConversationReference()
  }
  await memory.write(changes)

  const authProvider = new MsalTokenProvider()
  const token = await authProvider.getAccessToken(authConfig, botClientConfig.botId)

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
  return response.json()
}
