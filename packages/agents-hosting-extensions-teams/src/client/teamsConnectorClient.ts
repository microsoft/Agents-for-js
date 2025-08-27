/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { Activity, ChannelAccount } from '@microsoft/agents-activity'
import { TeamsChannelAccount } from '../activity-extensions/teamsChannelAccount'
import { MeetingInfo } from '../meeting/meetingInfo'
import { MeetingNotification } from '../meeting/meetingNotification'
import { MeetingNotificationResponse } from '../meeting/meetingNotificationResponse'
import { ChannelInfo } from '../activity-extensions/channelInfo'
import { TeamsChannelData } from '../activity-extensions'
import { BatchFailedEntriesResponse, BatchOperationStateResponse, CancelOperationResponse, TeamDetails, TeamsBatchOperationResponse, TeamsMember, TeamsPagedMembersResult } from './teamsConnectorClient.types'
import { ConnectorClient } from '@microsoft/agents-hosting'

interface ConversationList {
  conversations?: ChannelInfo[]
}
/**
 * A client for interacting with Microsoft Teams APIs.
 * Extends the ConnectorClient class to provide Teams-specific functionalities.
 */
export class TeamsConnectorClient {
  private axiosInstance: AxiosInstance
  constructor (private client: ConnectorClient) {
    this.axiosInstance = client.axiosInstance
  }

  /**
   * Retrieves a member from a conversation or team.
   * @param activity - The activity containing the context.
   * @param userId - The ID of the user to retrieve.
   * @returns A TeamsChannelAccount representing the member.
   */
  static async getMember (activity: Activity, userId: string): Promise<TeamsChannelAccount> {
    const teamsChannelData = activity.channelData as TeamsChannelData
    const teamId = teamsChannelData.team?.id
    if (teamId) {
      return await this.getTeamMember(activity, teamId, userId)
    } else {
      const conversationId = (activity.conversation != null) && activity.conversation.id ? activity.conversation.id : undefined
      return await this.getMemberInternal(activity, conversationId, userId)
    }
  }

  /**
   * Retrieves the team ID from an activity.
   * @param activity - The activity containing the context.
   * @returns The team ID as a string.
   * @throws Error if the activity is missing or invalid.
   */
  private static getTeamId (activity: any): string {
    if (!activity) {
      throw new Error('Missing activity parameter')
    }
    const channelData = activity.channelData as TeamsChannelData
    const team = channelData && (channelData.team != null) ? channelData.team : undefined
    const teamId = (team != null) && typeof team.id === 'string' ? team.id : undefined
    return teamId as string
  }

  /**
   * Retrieves a member from a team.
   * @param activity - The activity containing the context.
   * @param teamId - The ID of the team.
   * @param userId - The ID of the user to retrieve.
   * @returns A TeamsChannelAccount representing the team member.
   * @throws Error if the teamId or userId is missing.
   */
  static async getTeamMember (activity: any, teamId?: string, userId?: string) {
    const t = teamId || this.getTeamId(activity)
    if (!t) {
      throw new Error('This method is only valid within the scope of a MS Teams Team.')
    }
    if (!userId) {
      throw new Error('userId is required')
    }
    return await this.getMemberInternal(activity, t, userId)
  }

  /**
   * Retrieves a member from a conversation.
   * @param conversationId - The ID of the conversation.
   * @param userId - The ID of the user to retrieve.
   * @returns A ChannelAccount representing the conversation member.
   */
  public async getConversationMember (conversationId: string, userId: string): Promise<ChannelAccount> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `/v3/conversations/${conversationId}/members/${userId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response: AxiosResponse = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Retrieves a member from a conversation or team internally.
   * @param activity - The activity containing the context.
   * @param conversationId - The ID of the conversation.
   * @param userId - The ID of the user to retrieve.
   * @returns A ChannelAccount representing the member.
   * @throws Error if the conversationId is missing or the client is unavailable.
   */
  static async getMemberInternal (
    activity: any,
    conversationId: string | undefined,
    userId: string
  ): Promise<ChannelAccount> {
    if (!conversationId) {
      throw new Error('conversationId is required')
    }
    const client : ConnectorClient = activity.turnState?.get(activity.adapter.ConnectorClientKey)
    if (!client) {
      throw new Error('Client is not available in the context.')
    }
    const teamMember: ChannelAccount = await client.getConversationMember(conversationId, userId)
    return teamMember
  }

  /**
   * Retrieves paged members of a conversation.
   * @param conversationId - The ID of the conversation.
   * @param pageSize - The number of members per page.
   * @param continuationToken - The token for pagination.
   * @returns A TeamsPagedMembersResult containing the paged members.
   */
  public async getConversationPagedMember (conversationId: string, pageSize: number, continuationToken: string): Promise<TeamsPagedMembersResult> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/conversations/${conversationId}/pagedMembers`,
      params: {
        pageSize,
        continuationToken
      }
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Fetches the list of channels in a team.
   * @param teamId - The ID of the team.
   * @returns An array of ChannelInfo objects representing the channels.
   */
  public async fetchChannelList (teamId: string): Promise<ChannelInfo[]> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}/conversations`
    }
    const response = await this.axiosInstance(config)
    const convList: ConversationList = response.data
    return convList.conversations || []
  }

  /**
   * Fetches the details of a team.
   * @param teamId - The ID of the team.
   * @returns A TeamDetails object containing the team details.
   */
  public async fetchTeamDetails (teamId: string): Promise<TeamDetails> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}`
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Fetches information about a meeting participant.
   * @param meetingId - The ID of the meeting.
   * @param participantId - The ID of the participant.
   * @param tenantId - The tenant ID.
   * @returns A string containing participant information.
   */
  public async fetchMeetingParticipant (meetingId: string, participantId: string, tenantId: string): Promise<string> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}/participants/${participantId}`,
      params: { tenantId }
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Fetches information about a meeting.
   * @param meetingId - The ID of the meeting.
   * @returns A MeetingInfo object containing the meeting information.
   */
  public async fetchMeetingInfo (meetingId: string): Promise<MeetingInfo> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}`
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Sends a notification to a meeting.
   * @param meetingId - The ID of the meeting.
   * @param notification - The notification to send.
   * @returns A MeetingNotificationResponse object containing the response.
   */
  public async sendMeetingNotification (meetingId: string, notification: MeetingNotification): Promise<MeetingNotificationResponse> {
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v1/meetings/${meetingId}/notification`,
      data: notification
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Sends a message to a list of users.
   * @param activity - The activity to send.
   * @param tenantId - The tenant ID.
   * @param members - The list of members to send the message to.
   * @returns A TeamsBatchOperationResponse object containing the response.
   */
  public async sendMessageToListOfUsers (activity: Activity, tenantId: string, members: TeamsMember[]): Promise<TeamsBatchOperationResponse> {
    const content = {
      activity,
      members,
      tenantId
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/users',
      data: content
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Sends a message to all users in a tenant.
   * @param activity - The activity to send.
   * @param tenandId - The tenant ID.
   * @returns A TeamsBatchOperationResponse object containing the response.
   */
  public async sendMessageToAllUsersInTenant (activity: Activity, tenandId: string): Promise<TeamsBatchOperationResponse> {
    const content = {
      activity,
      tenandId
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/tenant',
      data: content
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Sends a message to all users in a team.
   * @param activity - The activity to send.
   * @param tenantId - The tenant ID.
   * @param teamId - The team ID.
   * @returns A TeamsBatchOperationResponse object containing the response.
   */
  public async sendMessageToAllUsersInTeam (activity: Activity, tenantId: string, teamId: string): Promise<TeamsBatchOperationResponse> {
    const content = {
      activity,
      tenantId,
      teamId
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/team',
      data: content
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Sends a message to a list of channels.
   * @param activity - The activity to send.
   * @param tenantId - The tenant ID.
   * @param members - The list of members to send the message to.
   * @returns A TeamsBatchOperationResponse object containing the response.
   */
  public async sendMessageToListOfChannels (activity: Activity, tenantId: string, members: TeamsMember[]): Promise<TeamsBatchOperationResponse> {
    const content = {
      activity,
      tenantId,
      members
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/channels',
      data: content
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Retrieves the state of a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A BatchOperationStateResponse object containing the operation state.
   */
  public async getOperationState (operationId: string): Promise<BatchOperationStateResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/${operationId}`
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Retrieves the failed entries of a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A BatchFailedEntriesResponse object containing the failed entries.
   */
  public async getFailedEntries (operationId: string): Promise<BatchFailedEntriesResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/failedentries/${operationId}`
    }
    const response = await this.axiosInstance(config)
    return response.data
  }

  /**
   * Cancels a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A CancelOperationResponse object containing the response.
   */
  public async cancelOperation (operationId: string): Promise<CancelOperationResponse> {
    const config: AxiosRequestConfig = {
      method: 'delete',
      url: `v3/batch/conversation/${operationId}`
    }

    const response = await this.axiosInstance(config)
    return response.data
  }
}
