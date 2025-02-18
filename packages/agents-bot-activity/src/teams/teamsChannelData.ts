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

export interface TeamsChannelData {
  channel?: ChannelInfo
  eventType?: string
  team?: TeamInfo
  notification?: NotificationInfo
  tenant?: TenantInfo
  meeting?: TeamsMeetingInfo
  settings?: TeamsChannelDataSettings
  onBehalfOf?: OnBehalfOf[]
}

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
