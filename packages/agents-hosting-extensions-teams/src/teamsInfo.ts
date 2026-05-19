/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from './errorHelper'
import { type ChannelInfo, type MeetingInfo, type MeetingNotificationParams, type MeetingNotificationResponse, type MeetingParticipant, type PagedMembersResult, type TeamDetails, type TeamsChannelAccount } from '@microsoft/teams.api'
import { parseTeamsChannelData } from './activity-extensions'
import { TurnContext } from '@microsoft/agents-hosting'
import { getTeamsClient } from './teamsApiClient'

/**
 * Provides utility methods for interacting with Microsoft Teams-specific features.
 * This class includes methods for retrieving team details, meeting information, sending messages,
 * and managing operations within the Teams environment.
 */
export class TeamsInfo {
  /**
   * Gets the meeting participant information.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [meetingId] - The meeting ID.
   * @param {string} [participantId] - The participant ID.
   * @param {string} [tenantId] - The tenant ID.
   * @returns {Promise<MeetingParticipant>} - The meeting participant information.
   */
  static async getMeetingParticipant (
    context: TurnContext,
    meetingId?: string,
    participantId?: string,
    tenantId?: string
  ): Promise<MeetingParticipant> {
    if (!context) {
      throw ExceptionHelper.generateException(Error, Errors.ContextRequired)
    }

    const activity = context.activity
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)

    if (meetingId == null) {
      meetingId = teamsChannelData.meeting?.id
    }

    if (!meetingId) {
      throw ExceptionHelper.generateException(Error, Errors.MeetingIdRequired)
    }

    if (participantId == null) {
      const from = activity.from
      participantId = from?.aadObjectId
    }

    if (!participantId) {
      throw ExceptionHelper.generateException(Error, Errors.ParticipantIdRequired)
    }

    const resolvedTenantId = tenantId ?? teamsChannelData.tenant?.id
    if (resolvedTenantId == null) {
      throw ExceptionHelper.generateException(Error, Errors.TenantIdRequired)
    }

    const res = await getTeamsClient(context).meetings.getParticipant(meetingId, participantId, resolvedTenantId)
    return res as MeetingParticipant
  }

  /**
   * Gets the meeting information.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [meetingId] - The meeting ID.
   * @returns {Promise<MeetingInfo>} - The meeting information.
   */
  static async getMeetingInfo (context: TurnContext, meetingId?: string): Promise<MeetingInfo> {
    const resolvedMeetingId = meetingId ?? parseTeamsChannelData(context.activity.channelData)?.meeting?.id
    if (resolvedMeetingId == null) {
      throw ExceptionHelper.generateException(Error, Errors.MeetingIdRequired)
    }
    const res = await getTeamsClient(context).meetings.getById(resolvedMeetingId)
    return res as MeetingInfo
  }

  /**
   * Gets the team details.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [teamId] - The team ID.
   * @returns {Promise<TeamDetails>} - The team details.
   */
  static async getTeamDetails (context: TurnContext, teamId?: string): Promise<TeamDetails> {
    const resolvedTeamId = teamId ?? parseTeamsChannelData(context.activity.channelData)?.team?.id
    if (resolvedTeamId == null) {
      throw ExceptionHelper.generateException(Error, Errors.TeamIdRequired)
    }
    const res = await getTeamsClient(context).teams.getById(resolvedTeamId)
    return res as TeamDetails
  }

  /**
   * Gets the channels of a team.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [teamId] - The team ID.
   * @returns {Promise<ChannelInfo[]>} - The list of channels.
   */
  static async getTeamChannels (context: TurnContext, teamId?: string): Promise<ChannelInfo[]> {
    const resolvedTeamId = teamId ?? parseTeamsChannelData(context.activity.channelData)?.team?.id
    if (resolvedTeamId == null) {
      throw ExceptionHelper.generateException(Error, Errors.TeamIdRequired)
    }
    return await getTeamsClient(context).teams.getConversations(resolvedTeamId)
  }

  /**
   * Gets the paged members of a team or conversation.
   *
   * @param {TurnContext} context - The turn context.
   * @param {number} [pageSize] - The page size.
   * @param {string} [continuationToken] - The continuation token.
   * @returns {Promise<PagedMembersResult>} - The paged members result.
   */
  static async getPagedMembers (context: TurnContext, pageSize?: number, continuationToken?: string): Promise<PagedMembersResult> {
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
    const teamId = teamsChannelData.team?.id
    if (teamId) {
      return await this.getPagedTeamMembers(context, teamId, pageSize, continuationToken)
    } else {
      const conversation = context.activity.conversation
      const conversationId = conversation && conversation.id ? conversation.id : undefined
      const client = getTeamsClient(context)
      return await client.conversations.members(conversationId!).getPaged(pageSize, continuationToken)
    }
  }

  /**
   * Gets a member of a team or conversation.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} userId - The user ID.
   * @returns {Promise<TeamsChannelAccount>} - The member information.
   */
  static async getMember (context: TurnContext, userId: string): Promise<TeamsChannelAccount> {
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
    const teamId = teamsChannelData.team?.id
    if (teamId) {
      return await this.getTeamMember(context, teamId, userId)
    } else {
      const conversationId = context.activity.conversation!.id
      return await this.getMemberInternal(context, conversationId, userId)
    }
  }

  /**
   * Gets the paged members of a team.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [teamId] - The team ID.
   * @param {number} [pageSize] - The page size.
   * @param {string} [continuationToken] - The continuation token.
   * @returns {Promise<PagedMembersResult>} - The paged members result.
   */
  static async getPagedTeamMembers (context: TurnContext, teamId?: string, pageSize?: number, continuationToken?: string): Promise<PagedMembersResult> {
    const resolvedTeamId = teamId ?? parseTeamsChannelData(context.activity.channelData)?.team?.id
    if (resolvedTeamId == null) {
      throw ExceptionHelper.generateException(Error, Errors.TeamIdRequired)
    }
    const client = getTeamsClient(context)
    return await client.conversations.members(resolvedTeamId).getPaged(pageSize, continuationToken)
  }

  /**
   * Gets a member of a team.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} teamId - The team ID.
   * @param {string} userId - The user ID.
   * @returns {Promise<TeamsChannelAccount>} - The member information.
   */
  static async getTeamMember (context: TurnContext, teamId: string, userId: string): Promise<TeamsChannelAccount> {
    return await getTeamsClient(context).conversations.members(teamId).getById(userId)
  }

  /**
   * Sends a meeting notification.
   *
   * @param {TurnContext} context - The turn context.
   * @param {MeetingNotificationParams} notification - The meeting notification params.
   * @param {string} [meetingId] - The meeting ID.
   * @returns {Promise<MeetingNotificationResponse | undefined>} - `undefined` on full success (HTTP 202) or a `MeetingNotificationResponse`
   * with per-recipient failure info on partial success (HTTP 207).
   */
  static async sendMeetingNotification (context: TurnContext, notification: MeetingNotificationParams, meetingId?: string): Promise<MeetingNotificationResponse | undefined> {
    const activity = context.activity

    if (meetingId == null) {
      const teamsChannelData = parseTeamsChannelData(activity.channelData)
      const meeting = teamsChannelData.meeting
      meetingId = meeting?.id
    }

    if (!meetingId) {
      throw ExceptionHelper.generateException(Error, Errors.MeetingIdRequired)
    }

    return await getTeamsClient(context).meetings.sendNotification(meetingId, notification)
  }

  private static async getMemberInternal (context: TurnContext, conversationId: string, userId: string): Promise<TeamsChannelAccount> {
    return await getTeamsClient(context).conversations.members(conversationId).getById(userId)
  }
}
