// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, type ChannelAccount, ExceptionHelper } from '@microsoft/agents-activity'
import type { ChannelData, OnBehalfOf, QuotedReplyEntity, TargetedMessageInfoEntity } from '@microsoft/teams.api'
import { parseTeamsChannelData } from './activity-extensions'
import { Errors } from './errorHelper'

const QUOTED_REPLY_ENTITY_TYPE = 'quotedReply'
const TARGETED_MESSAGE_INFO_ENTITY_TYPE = 'targetedMessageInfo'

type TeamsRecipient = ChannelAccount & {
  isTargeted?: unknown
}

function requireNonEmptyString (value: string, parameterName: string): void {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw ExceptionHelper.generateException(TypeError, Errors.ActivityParameterRequired, undefined, { parameterName })
  }
}

function escapeXmlAttribute (value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

/**
 * Gets the Teams selected channel ID from the activity's channel data settings.
 *
 * @param activity - Activity containing Teams channel data.
 * @returns The selected channel ID, if present.
 */
export function teamsGetSelectedChannelId (activity: Activity): string | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.settings?.selectedChannel?.id
}

/**
 * Gets the Teams channel ID from the activity's channel data.
 *
 * @param activity - Activity containing Teams channel data.
 * @returns The Teams channel ID, if present.
 */
export function teamsGetChannelId (activity: Activity): string | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.channel?.id
}

/**
 * Gets the Teams meeting info from the activity's channel data.
 *
 * @param activity - Activity containing Teams channel data.
 * @returns Teams meeting information, if present.
 */
export function teamsGetMeetingInfo (activity: Activity): ChannelData['meeting'] | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return channelData?.meeting
}

/**
 * Gets the Teams team info from the activity's channel data.
 *
 * @param activity - Activity containing Teams channel data.
 * @returns Teams team information, if present.
 */
export function teamsGetTeamInfo (activity: Activity): ChannelData['team'] | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return channelData?.team
}

/**
 * Configures the activity to generate a notification within Teams.
 * @param activity - The activity to configure.
 * @param alertInMeeting - If true, renders a popup in meeting chat as well as the chat thread.
 * @param externalResourceUrl - URL to external resource (must be in manifest's valid domains).
 */
export function teamsNotifyUser (activity: Activity, alertInMeeting: boolean = false, externalResourceUrl?: string): void {
  if (!activity.channelData || typeof activity.channelData !== 'object') {
    activity.channelData = {}
  }
  const channelData = activity.channelData as Record<string, unknown>
  channelData.notification = {
    alert: !alertInMeeting,
    alertInMeeting,
    ...(externalResourceUrl != null && { externalResourceUrl })
  }
}

/**
 * Gets the Teams OnBehalfOf list from the activity's channel data.
 *
 * @param activity - Activity containing Teams channel data.
 * @returns The Teams on-behalf-of entries, if present.
 */
export function teamsGetTeamOnBehalfOf (activity: Activity): OnBehalfOf[] | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.onBehalfOf
}

/**
 * Gets all quoted reply entities from an activity.
 *
 * @param activity - Activity containing quoted reply entities.
 * @returns The quoted reply entities in their original order.
 */
export function getQuotedMessages (activity: Activity): QuotedReplyEntity[] {
  return (activity.entities ?? []).filter(entity => entity.type === QUOTED_REPLY_ENTITY_TYPE) as QuotedReplyEntity[]
}

/**
 * Adds a quoted reply entity and its Teams text placeholder to an activity.
 *
 * @param activity - Activity to update.
 * @param messageId - ID of the message being quoted.
 * @param text - Optional text to append after the quote placeholder.
 * @returns The updated activity.
 */
export function addQuotedReply (activity: Activity, messageId: string, text?: string): Activity {
  requireNonEmptyString(messageId, 'messageId')
  activity.entities ??= []
  activity.entities.push({
    type: QUOTED_REPLY_ENTITY_TYPE,
    quotedReply: { messageId }
  })
  activity.text = `<quoted messageId="${escapeXmlAttribute(messageId)}"/>${activity.text ? ` ${activity.text}` : ''}${text !== undefined ? ` ${text}` : ''}`
  return activity
}

/**
 * Gets the first targeted message information entity from an activity.
 *
 * @param activity - Activity containing Teams entities.
 * @returns Targeted message information, if present.
 */
export function getTargetedMessageInfo (activity: Activity): TargetedMessageInfoEntity | undefined {
  return activity.entities?.find(entity => entity.type === TARGETED_MESSAGE_INFO_ENTITY_TYPE) as TargetedMessageInfoEntity | undefined
}

/**
 * Adds targeted message information when the activity does not already contain it.
 *
 * @param activity - Activity to update.
 * @param messageId - ID of the original targeted message.
 * @returns The updated activity.
 */
export function addTargetedMessageInfo (activity: Activity, messageId: string): Activity {
  requireNonEmptyString(messageId, 'messageId')
  if (!getTargetedMessageInfo(activity)) {
    activity.entities ??= []
    activity.entities.push({ type: TARGETED_MESSAGE_INFO_ENTITY_TYPE, messageId })
  }
  return activity
}

/**
 * Determines whether the activity recipient is marked as targeted by Teams.
 *
 * @param activity - Activity to inspect.
 * @returns True when the recipient is targeted.
 */
export function isRecipientTargeted (activity: Activity): boolean {
  const recipient = activity.recipient as TeamsRecipient | undefined
  return recipient?.isTargeted === true
}

/**
 * Adds the Teams feedback loop flag to the activity's channel data.
 * Returns false if channel data is already set.
 *
 * @param activity - The activity to configure.
 * @param feedbackLoopType - The feedback loop type value. Defaults to "default".
 * @returns True when feedback loop channel data was added; otherwise false.
 */
export function teamsEnableFeedbackLoop (activity: Activity, feedbackLoopType: string = 'default'): boolean {
  if (activity.channelData != null) {
    return false
  }
  activity.channelData = {
    feedbackLoop: {
      type: feedbackLoopType
    }
  }
  return true
}
