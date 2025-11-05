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
import { MembershipSource } from '@microsoft/agents-activity'

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
  /**
   * List of teams that a channel was shared with.
   */
  sharedWithTeams?: TeamInfo[]
  /**
   * List of teams that a channel was unshared from.
   */
  unsharedFromTeams?: TeamInfo[]
  /**
   * Information about the source of a member that was added or removed from a shared channel.
   */
  membershipSource?: MembershipSource
}

/**
 * @private
 * Zod schema for validating membership source types.
 */
const membershipSourceTypeZodSchema = z.enum(['channel', 'team'])

/**
 * Zod schema for validating membership source types.
 */
const membershipTypeZodSchema = z.enum(['direct', 'transitive'])

/**
 * @private
 * Zod schema for validating a membership source.
 */
const membershipSourceZodSchema = z.object({
  sourceType: membershipSourceTypeZodSchema,
  id: z.string().min(1),
  name: z.string().optional(),
  membershipType: membershipTypeZodSchema,
  aadGroupId: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(),
})

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
  onBehalfOf: z.array(onBehalfOfZodSchema).optional(),
  sharedWithTeams: z.array(teamInfoZodSchema).optional(),
  unsharedFromTeams: z.array(teamInfoZodSchema).optional(),
  membershipSource: membershipSourceZodSchema.optional()
})

/**
 * Parses the given object as TeamsChannelData.
 *
 * @param {object} o - The object to parse.
 * @returns {TeamsChannelData} - The parsed TeamsChannelData.
 */
export function parseTeamsChannelData (o: object): TeamsChannelData {
  return teamsChannelDataZodSchema.passthrough().parse(o) as TeamsChannelData
}
