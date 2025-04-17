/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios'
import { Activity, ChannelAccount } from '@microsoft/agents-activity'
import { ConnectorClient, AuthConfiguration, AuthProvider, getProductInfo } from '@microsoft/agents-hosting'
import { TeamsChannelAccount } from './teamsChannelAccount'
import { TeamsPagedMembersResult } from './teamsPagedMembersResult'
import { TeamDetails } from './teamDetails'
import { TeamsMember } from './teamsMember'
import { MeetingInfo } from './meetingInfo'
import { MeetingNotification } from './meetingNotification'
import { MeetingNotificationResponse } from './meetingNotificationResponse'
import { TeamsBatchOperationResponse } from './teamsBatchOperationResponse'
import { BatchOperationStateResponse } from './batchOperationStateResponse'
import { BatchFailedEntriesResponse } from './batchFailedEntriesResponse'
import { CancelOperationResponse } from './cancelOperationResponse'
import { ChannelInfo, TeamsChannelData } from '../channel-data'

export class TeamsConnectorClient extends ConnectorClient {
  /**
   * Creates a new instance of ConnectorClient with authentication.
   * @param baseURL - The base URL for the API.
   * @param authConfig - The authentication configuration.
   * @param authProvider - The authentication provider.
   * @param scope - The scope for the authentication token.
   * @returns A new instance of ConnectorClient.
   */
  static async createClientWithAuthAsync (
    baseURL: string,
    authConfig: AuthConfiguration,
    authProvider: AuthProvider,
    scope: string
  ): Promise<TeamsConnectorClient> {
    const axiosInstance = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'User-Agent': getProductInfo(),
      }
    })

    const token = await authProvider.getAccessToken(authConfig, scope)
    if (token.length > 1) {
      axiosInstance.defaults.headers.common.Authorization = `Bearer ${token}`
    }
    return new TeamsConnectorClient(axiosInstance)
  }

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

  private static getTeamId (activity: any): string {
    if (!activity) {
      throw new Error('Missing activity parameter')
    }
    const channelData = activity.channelData as TeamsChannelData
    const team = channelData && (channelData.team != null) ? channelData.team : undefined
    const teamId = (team != null) && typeof team.id === 'string' ? team.id : undefined
    return teamId as string
  }

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

  public async getConversationMember (conversationId: string, userId: string): Promise<ChannelAccount> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `/v3/conversations/${conversationId}/members/${userId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response: AxiosResponse = await this.client(config)
    return response.data
  }

  static async getMemberInternal (
    activity: any,
    conversationId: string | undefined,
    userId: string
  ): Promise<ChannelAccount> {
    if (!conversationId) {
      throw new Error('conversationId is required')
    }
    const client = activity.turnState?.get(activity.adapter.ConnectorClientKey) as TeamsConnectorClient
    if (!client) {
      throw new Error('Client is not available in the context.')
    }
    const teamMember: ChannelAccount = await client.getConversationMember(conversationId, userId)
    return teamMember
  }

  public async getConversationPagedMember (conversationId: string, pageSize: number, continuationToken: string): Promise<TeamsPagedMembersResult> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/conversations/${conversationId}/pagedMembers`,
      params: {
        pageSize,
        continuationToken
      }
    }
    const response = await this.client(config)
    return response.data
  }

  public async fetchChannelList (teamId: string): Promise<ChannelInfo[]> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}/conversations`
    }
    const response = await this.client(config)
    return response.data
  }

  public async fetchTeamDetails (teamId: string): Promise<TeamDetails> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}`
    }
    const response = await this.client(config)
    return response.data
  }

  public async fetchMeetingParticipant (meetingId: string, participantId: string, tenantId: string): Promise<string> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}/participants/${participantId}`,
      params: { tenantId }
    }
    const response = await this.client(config)
    return response.data
  }

  public async fetchMeetingInfo (meetingId: string): Promise<MeetingInfo> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}`
    }
    const response = await this.client(config)
    return response.data
  }

  public async sendMeetingNotification (meetingId: string, notification: MeetingNotification): Promise<MeetingNotificationResponse> {
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v1/meetings/${meetingId}/notification`,
      data: notification
    }
    const response = await this.client(config)
    return response.data
  }

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
    const response = await this.client(config)
    return response.data
  }

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
    const response = await this.client(config)
    return response.data
  }

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
    const response = await this.client(config)
    return response.data
  }

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
    const response = await this.client(config)
    return response.data
  }

  public async getOperationState (operationId: string): Promise<BatchOperationStateResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/${operationId}`
    }
    const response = await this.client(config)
    return response.data
  }

  public async getFailedEntries (operationId: string): Promise<BatchFailedEntriesResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/failedentries/${operationId}`
    }
    const response = await this.client(config)
    return response.data
  }

  public async cancelOperation (operationId: string): Promise<CancelOperationResponse> {
    const config: AxiosRequestConfig = {
      method: 'delete',
      url: `v3/batch/conversation/${operationId}`
    }

    const response = await this.client(config)
    return response.data
  }
}
