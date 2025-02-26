import { Activity, RoleTypes } from '@microsoft/agents-bot-activity'
import { BotClientConfig } from './botClientConfig'
import { v4 } from 'uuid'
import { AuthConfiguration, MsalTokenProvider } from '../auth'
import { ConnectorClient } from '../connector-client'

export const PostActivity = async (activity: Activity, botClientConfig: BotClientConfig, authConfig: AuthConfiguration): Promise<unknown> => {
  // const conversationReference = activity.getConversationReference()
  activity.conversation!.id = v4()
  activity.serviceUrl = botClientConfig.serviceUrl
  activity.recipient = { id: botClientConfig.botId, role: RoleTypes.Skill }
  const authProvider = new MsalTokenProvider()
  // const token = await authProvider.getAccessToken(authConfig, botClientConfig.botId)
  const client = await ConnectorClient.createClientWithAuthAsync(botClientConfig.botEndPoint, authConfig, authProvider, botClientConfig.botId)
  return await client.replyToActivityAsync(activity.conversation!.id, activity.id!, activity)
  // const response = await fetch(botClientConfig.botEndPoint, {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //     Authorization: `Bearer ${token}`
  //   },
  //   body: JSON.stringify(activity)
  // })
  // if (!response.ok) {
  //   throw new Error(`Failed to post activity to bot: ${response.statusText}`)
  // }
  // return response.json()
}
