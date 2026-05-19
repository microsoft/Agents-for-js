// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity } from '@microsoft/agents-activity'
import type { ChannelData, OnBehalfOf } from '@microsoft/teams.api'
import { parseTeamsChannelData } from './activity-extensions'

/**
 * Gets the Teams selected channel ID from the activity's channel data settings.
 */
export function teamsGetSelectedChannelId (activity: Activity): string | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.settings?.selectedChannel?.id
}

/**
 * Gets the Teams channel ID from the activity's channel data.
 */
export function teamsGetChannelId (activity: Activity): string | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.channel?.id
}

/**
 * Gets the Teams meeting info from the activity's channel data.
 */
export function teamsGetMeetingInfo (activity: Activity): ChannelData['meeting'] | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return channelData?.meeting
}

/**
 * Gets the Teams team info from the activity's channel data.
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
 */
export function teamsGetTeamOnBehalfOf (activity: Activity): OnBehalfOf[] | undefined {
  const channelData = parseTeamsChannelData(activity.channelData)
  return (channelData as any)?.onBehalfOf
}

/**
 * Adds the Teams feedback loop flag to the activity's channel data.
 * Returns false if channel data is already set.
 * @param activity - The activity to configure.
 * @param feedbackLoopType - The feedback loop type value. Defaults to "default".
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
