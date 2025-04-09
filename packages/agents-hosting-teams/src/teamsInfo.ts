/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from './connector-client/teamsChannelAccount'
import { TeamsMeetingParticipant } from './meeting/teamsMeetingParticipant'
import { MeetingInfo } from './connector-client/meetingInfo'
import { TeamDetails } from './connector-client/teamDetails'
import { TeamsPagedMembersResult } from './connector-client/teamsPagedMembersResult'
import { MeetingNotification } from './connector-client/meetingNotification'
import { MeetingNotificationResponse } from './connector-client/meetingNotificationResponse'
import { TeamsMember } from './connector-client/teamsMember'
import { BatchOperationStateResponse } from './connector-client/batchOperationStateResponse'
import { BatchFailedEntriesResponse } from './connector-client/batchFailedEntriesResponse'
import { CancelOperationResponse } from './connector-client/cancelOperationResponse'
import { Activity, Channels, ConversationReference, ConversationParameters } from '@microsoft/agents-activity'
import { TeamsConnectorClient } from './connector-client/teamsConnectorClient'
import { ChannelInfo } from './channel-data'
import { parseTeamsChannelData } from './parsers/teamsChannelDataParser'
import { BatchOperationResponse } from './connector-client/batchOperationResponse'
import { CloudAdapter, TurnContext } from '@microsoft/agents-hosting'

export class TeamsInfo {
  /**
   * Gets the meeting participant information.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [meetingId] - The meeting ID.
   * @param {string} [participantId] - The participant ID.
   * @param {string} [tenantId] - The tenant ID.
   * @returns {Promise<TeamsMeetingParticipant>} - The meeting participant information.
   */
  static async getMeetingParticipant (
    context: TurnContext,
    meetingId?: string,
    participantId?: string,
    tenantId?: string
  ): Promise<TeamsMeetingParticipant> {
    if (!context) {
      throw new Error('context is required.')
    }

    const activity = context.activity
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData) // teamsGetTeamMeetingInfo(activity)

    if (meetingId == null) {
      meetingId = teamsChannelData.meeting?.id
    }

    if (!meetingId) {
      throw new Error('meetingId is required.')
    }

    if (participantId == null) {
      const from = activity.from
      participantId = from?.aadObjectId
    }

    if (!participantId) {
      throw new Error('participantId is required.')
    }

    if (tenantId === undefined) {
      const tenant = teamsChannelData.tenant // teamsGetTenant(activity)
      tenantId = tenant?.id
    }

    // return this.getTeamsConnectorClient(context).teams.fetchMeetingParticipant(meetingId, participantId, { tenantId })
    const res = await this.getRestClient(context).fetchMeetingParticipant(meetingId, participantId, tenantId!)
    return res as TeamsMeetingParticipant
  }

  /**
   * Gets the meeting information.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [meetingId] - The meeting ID.
   * @returns {Promise<MeetingInfo>} - The meeting information.
   */
  static async getMeetingInfo (context: TurnContext, meetingId?: string): Promise<MeetingInfo> {
    if (!meetingId) {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      meetingId = teamsChannelData.meeting?.id
    }
    const res = await this.getRestClient(context).fetchMeetingInfo(meetingId!)
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
    if (!teamId) {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      teamId = teamsChannelData.team?.id
    }
    if (!teamId) {
      throw new Error('teamId is required.')
    }
    const res = await this.getRestClient(context).fetchTeamDetails(teamId!)
    return res as TeamDetails
  }

  /**
   * Sends a message to a Teams channel.
   *
   * @param {TurnContext} context - The turn context.
   * @param {Activity} activity - The activity to send.
   * @param {string} teamsChannelId - The Teams channel ID.
   * @param {string} [appId] - The application ID.
   * @returns {Promise<[ConversationReference, string]>} - The conversation reference and new activity ID.
   */
  static async sendMessageToTeamsChannel (context: TurnContext, activity: Activity, teamsChannelId: string, appId?: string): Promise<[ConversationReference, string]> {
    if (!context) {
      throw new Error('TurnContext cannot be null')
    }

    if (!activity) {
      throw new Error('Activity cannot be null')
    }

    if (!teamsChannelId) {
      throw new Error('The teamsChannelId cannot be null or empty')
    }
    const convoParams = {
      isGroup: true,
      channelData: {
        channel: {
          id: teamsChannelId,
        },
      },
      activity,
      agent: context.activity.recipient,
    } as ConversationParameters

    let conversationReference: Partial<ConversationReference>
    let newActivityId: string
    if (appId && context.adapter instanceof CloudAdapter) {
      await context.adapter.createConversationAsync(
        appId,
        Channels.Msteams,
        context.activity.serviceUrl!,
        'https://api.botframework.com',
        convoParams,
        async (turnContext) => {
          conversationReference = turnContext.activity.getConversationReference()
          newActivityId = turnContext.activity.id!
        }
      )
    } else {
      // const connectorClient = context.adapter.createConnectorClient(
      //   context.activity.serviceUrl
      // )
      const connectorClient = this.getRestClient(context)
      const conversationResourceResponse = await connectorClient.createConversationAsync(convoParams)
      conversationReference = context.activity.getConversationReference()
      conversationReference.conversation!.id = conversationResourceResponse.id
      newActivityId = conversationResourceResponse.activityId
    }

    // @ts-ignore
    return [conversationReference as ConversationReference, newActivityId]
  }

  /**
   * Gets the channels of a team.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} [teamId] - The team ID.
   * @returns {Promise<ChannelInfo[]>} - The list of channels.
   */
  static async getTeamChannels (context: TurnContext, teamId?: string): Promise<ChannelInfo[]> {
    if (!teamId) {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      teamId = teamsChannelData.team?.id
    }
    if (!teamId) {
      throw new Error('teamId is required.')
    }
    return await this.getRestClient(context).fetchChannelList(teamId!)
  }

  /**
   * Gets the paged members of a team or conversation.
   *
   * @param {TurnContext} context - The turn context.
   * @param {number} [pageSize] - The page size.
   * @param {string} [continuationToken] - The continuation token.
   * @returns {Promise<TeamsPagedMembersResult>} - The paged members result.
   */
  static async getPagedMembers (context: TurnContext, pageSize?: number, continuationToken?: string): Promise<TeamsPagedMembersResult> {
    const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
    const teamId = teamsChannelData.team?.id
    if (teamId) {
      return await this.getPagedTeamMembers(context, teamId, pageSize, continuationToken)
    } else {
      const conversation = context.activity.conversation
      const conversationId = conversation && conversation.id ? conversation.id : undefined
      return this.getRestClient(context).getConversationPagedMember(conversationId!, pageSize!, continuationToken!)
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
   * @returns {Promise<TeamsPagedMembersResult>} - The paged members result.
   */
  static async getPagedTeamMembers (context: TurnContext, teamId?: string, pageSize?: number, continuationToken?: string): Promise<TeamsPagedMembersResult> {
    if (!teamId) {
      const teamsChannelData = parseTeamsChannelData(context.activity.channelData)
      teamId = teamsChannelData.team?.id
    }
    if (!teamId) {
      throw new Error('teamId is required.')
    }
    const pagedResults = await this.getRestClient(context).getConversationPagedMember(teamId, pageSize!, continuationToken!)
    do {
      if (pagedResults.continuationToken) {
        const nextResults = await this.getRestClient(context).getConversationPagedMember(teamId, pageSize!, pagedResults.continuationToken)
        pagedResults.members.push(...nextResults.members)
        pagedResults.continuationToken = nextResults.continuationToken
      }
    } while (pagedResults.continuationToken)
    return pagedResults
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
    return await this.getRestClient(context).getConversationMember(teamId, userId)
  }

  /**
   * Sends a meeting notification.
   *
   * @param {TurnContext} context - The turn context.
   * @param {MeetingNotification} notification - The meeting notification.
   * @param {string} [meetingId] - The meeting ID.
   * @returns {Promise<MeetingNotificationResponse>} - The meeting notification response.
   */
  static async sendMeetingNotification (context: TurnContext, notification: MeetingNotification, meetingId?: string): Promise<MeetingNotificationResponse> {
    const activity = context.activity

    if (meetingId == null) {
      const teamsChannelData = parseTeamsChannelData(activity.channelData)
      // const meeting = teamsGetTeamMeetingInfo(activity)
      const meeting = teamsChannelData.meeting
      meetingId = meeting?.id
    }

    if (!meetingId) {
      throw new Error('meetingId is required.')
    }

    return await this.getRestClient(context).sendMeetingNotification(meetingId, notification)
  }

  /**
   * Sends a message to a list of users.
   *
   * @param {TurnContext} context - The turn context.
   * @param {Activity} activity - The activity to send.
   * @param {string} tenantId - The tenant ID.
   * @param {TeamsMember[]} members - The list of members.
   * @returns {Promise<BatchOperationResponse>} - The batch operation response.
   */
  static async sendMessageToListOfUsers (context: TurnContext, activity: Activity, tenantId: string, members: TeamsMember[]): Promise<BatchOperationResponse> {
    if (!activity) {
      throw new Error('activity is required.')
    }
    if (!tenantId) {
      throw new Error('tenantId is required.')
    }
    if (!members || members.length === 0) {
      throw new Error('members list is required.')
    }

    return await this.getRestClient(context).sendMessageToListOfUsers(activity, tenantId, members)
  }

  /**
   * Sends a message to all users in a tenant.
   *
   * @param {TurnContext} context - The turn context.
   * @param {Activity} activity - The activity to send.
   * @param {string} tenantId - The tenant ID.
   * @returns {Promise<BatchOperationResponse>} - The batch operation response.
   */
  static async sendMessageToAllUsersInTenant (context: TurnContext, activity: Activity, tenantId: string): Promise<BatchOperationResponse> {
    if (!activity) {
      throw new Error('activity is required.')
    }
    if (!tenantId) {
      throw new Error('tenantId is required.')
    }

    return await this.getRestClient(context).sendMessageToAllUsersInTenant(activity, tenantId)
  }

  /**
   * Sends a message to all users in a team.
   *
   * @param {TurnContext} context - The turn context.
   * @param {Activity} activity - The activity to send.
   * @param {string} tenantId - The tenant ID.
   * @param {string} teamId - The team ID.
   * @returns {Promise<BatchOperationResponse>} - The batch operation response.
   */
  static async sendMessageToAllUsersInTeam (context: TurnContext, activity: Activity, tenantId: string, teamId: string): Promise<BatchOperationResponse> {
    if (!activity) {
      throw new Error('activity is required.')
    }
    if (!tenantId) {
      throw new Error('tenantId is required.')
    }
    if (!teamId) {
      throw new Error('teamId is required.')
    }
    return await this.getRestClient(context).sendMessageToAllUsersInTeam(activity, tenantId, teamId)
  }

  /**
   * Sends a message to a list of channels.
   *
   * @param {TurnContext} context - The turn context.
   * @param {Activity} activity - The activity to send.
   * @param {string} tenantId - The tenant ID.
   * @param {TeamsMember[]} members - The list of members.
   * @returns {Promise<BatchOperationResponse>} - The batch operation response.
   */
  static async sendMessageToListOfChannels (context: TurnContext, activity: Activity, tenantId: string, members: TeamsMember[]): Promise<BatchOperationResponse> {
    if (!activity) {
      throw new Error('activity is required.')
    }
    if (!tenantId) {
      throw new Error('tenantId is required.')
    }
    if (!members || members.length === 0) {
      throw new Error('members list is required.')
    }
    return this.getRestClient(context).sendMessageToListOfChannels(activity, tenantId, members)
  }

  /**
   * Gets the operation state.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} operationId - The operation ID.
   * @returns {Promise<BatchOperationStateResponse>} - The operation state response.
   */
  static async getOperationState (context: TurnContext, operationId: string): Promise<BatchOperationStateResponse> {
    if (!operationId) {
      throw new Error('operationId is required.')
    }

    return await this.getRestClient(context).getOperationState(operationId)
  }

  /**
   * Gets the failed entries of an operation.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} operationId - The operation ID.
   * @returns {Promise<BatchFailedEntriesResponse>} - The failed entries response.
   */
  static async getFailedEntries (context: TurnContext, operationId: string): Promise<BatchFailedEntriesResponse> {
    if (!operationId) {
      throw new Error('operationId is required.')
    }

    return await this.getRestClient(context).getFailedEntries(operationId)
  }

  /**
   * Cancels an operation.
   *
   * @param {TurnContext} context - The turn context.
   * @param {string} operationId - The operation ID.
   * @returns {Promise<CancelOperationResponse>} - The cancel operation response.
   */
  static async cancelOperation (context: TurnContext, operationId: string): Promise<CancelOperationResponse> {
    if (!operationId) {
      throw new Error('operationId is required.')
    }

    return await this.getRestClient(context).cancelOperation(operationId)
  }

  private static async getMemberInternal (context: TurnContext, conversationId: string, userId: string): Promise<TeamsChannelAccount> {
    return await this.getRestClient(context).getConversationMember(conversationId, userId)
  }

  private static getRestClient (context: TurnContext) : TeamsConnectorClient {
    return context.turnState.get('teamsConnectorClient')
  }
}
