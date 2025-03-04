/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { z } from 'zod'
import { ChannelInfo, channelInfoZodSchema } from './channelInfo'
import { NotificationInfo, notificationInfoZodSchema } from './notificationInfo'
import { OnBehalfOf, onBehalfOfZodSchema } from './onBehalfOf'
import { TeamsChannelDataSettings, teamsChannelDataSettingsZodSchema } from './teamsChannelDataSettings'
import { TeamsMeetingInfo, teamsMeetingInfoZodSchema } from './teamsMeetingInfo'
import { TenantInfo, tenantInfoZodSchema } from './tenantInfo'
import { TeamInfo, teamInfoZodSchema } from './teamInfo'

/**
 * Represents data for a Teams channel.
 */
export interface TeamsChannelData {
  /**
   * Information about the channel.
   */
  channel?: ChannelInfo
  /**
   * The type of event.
   */
  eventType?: string
  /**
   * Information about the team.
   */
  team?: TeamInfo
  /**
   * Information about the notification.
   */
  notification?: NotificationInfo
  /**
   * Information about the tenant.
   */
  tenant?: TenantInfo
  /**
   * Information about the meeting.
   */
  meeting?: TeamsMeetingInfo
  /**
   * Settings for the Teams channel data.
   */
  settings?: TeamsChannelDataSettings
  /**
   * Information about the users on behalf of whom the action is performed.
   */
  onBehalfOf?: OnBehalfOf[]
}

/**
 * Zod schema for validating TeamsChannelData objects.
 */
export const teamsChannelDataZodSchema = z.object({
  channel: channelInfoZodSchema.optional(),
  eventType: z.string().min(1).optional(),
  team: teamInfoZodSchema.optional(),
  notification: notificationInfoZodSchema.optional(),
  tenant: tenantInfoZodSchema.optional(),
  meeting: teamsMeetingInfoZodSchema.optional(),
  settings: teamsChannelDataSettingsZodSchema.optional(),
  onBehalfOf: z.array(onBehalfOfZodSchema).optional()
})
