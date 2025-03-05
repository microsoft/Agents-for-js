import { Activity, RoleTypes } from '@microsoft/agents-bot-activity'
import { BotClientConfig } from './botClientConfig'
// import { v4 } from 'uuid'
import { AuthConfiguration, MsalTokenProvider } from '../auth'

export const PostActivity = async (activity: Activity, botClientConfig: BotClientConfig, authConfig: AuthConfiguration): Promise<unknown> => {
  // const conversationReference = activity.getConversationReference()
  const activityCopy = { ...activity }
  activity.serviceUrl = botClientConfig.serviceUrl
  activity.recipient = { id: botClientConfig.botId, role: RoleTypes.Skill }
  activity.relatesTo = {
    serviceUrl: activityCopy.serviceUrl,
    activityId: activityCopy.id,
    channelId: activityCopy.channelId!,
    locale: activityCopy.locale,
    conversation: activityCopy.conversation!
  }
  // activity.conversation!.id = v4()

  const authProvider = new MsalTokenProvider()
  const token = await authProvider.getAccessToken(authConfig, botClientConfig.botId)

  const response = await fetch(botClientConfig.botEndPoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(activity)
  })
  if (!response.ok) {
    throw new Error(`Failed to post activity to bot: ${response.statusText}`)
  }
  return response.json()
}
