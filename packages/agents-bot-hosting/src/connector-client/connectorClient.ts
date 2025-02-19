/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AuthConfiguration } from '../auth/authConfiguration'
import { AuthProvider } from '../auth/authProvider'
import { debug } from '../logger'
import { Activity, ChannelAccount, ChannelInfo, TeamsChannelData } from '@microsoft/agents-bot-activity'
import { ConversationsResult } from './conversationsResult'
import { TeamsChannelAccount } from './teamsChannelAccount'
import { ConversationParameters } from './conversationParameters'
import { ConversationResourceResponse } from './conversationResourceResponse'
import { ResourceResponse } from './resourceResponse'
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
import { AttachmentInfo } from './attachmentInfo'
import { AttachmentData } from './attachmentData'

const logger = debug('agents:rest-client')

/**
 * ConnectorClient is a client for interacting with the Microsoft Teams Connector API.
 */
export class ConnectorClient {
  private readonly client: AxiosInstance

  /**
   * Private constructor for the ConnectorClient.
   * @param client - The AxiosInstance to use for HTTP requests.
   */
  private constructor (client: AxiosInstance) {
    this.client = client
    this.client.interceptors.response.use(
      (config) => {
        const { status, statusText, config: requestConfig } = config
        logger.debug('Response: ', {
          status,
          statusText,
          data: config.config.data,
          url: requestConfig?.url,
          method: requestConfig?.method,
        })
        return config
      },
      (error) => {
        const { code, message, stack } = error
        const errorDetails = {
          code,
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message,
          stack,
        }
        return Promise.reject(errorDetails)
      }
    )
  }

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
  ): Promise<ConnectorClient> {
    const axiosInstance = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json'
      }
    })

    const token = await authProvider.getAccessToken(authConfig, scope)
    if (token.length > 1) {
      axiosInstance.defaults.headers.common.Authorization = `Bearer ${token}`
    }
    return new ConnectorClient(axiosInstance)
  }

  /**
   * Retrieves a list of conversations.
   * @param continuationToken - The continuation token for pagination.
   * @returns A list of conversations.
   */
  public async getConversationsAsync (continuationToken?: string): Promise<ConversationsResult> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: '/v3/conversations',
      params: continuationToken ? { continuationToken } : undefined
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Retrieves a conversation member by conversation ID and user ID.
   * @param conversationId - The ID of the conversation.
   * @param userId - The ID of the user.
   * @returns The conversation member.
   */
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

  /**
   * Retrieves a team member by activity and user ID.
   * @param activity - The activity object.
   * @param userId - The ID of the user.
   * @returns The team member.
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
   * @param activity - The activity object.
   * @returns The team ID.
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
   * Retrieves a team member by activity, team ID, and user ID.
   * @param activity - The activity object.
   * @param teamId - The ID of the team.
   * @param userId - The ID of the user.
   * @returns The team member.
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
   * Retrieves a member internally by activity, conversation ID, and user ID.
   * @param activity - The activity object.
   * @param conversationId - The ID of the conversation.
   * @param userId - The ID of the user.
   * @returns The conversation member.
   */
  static async getMemberInternal (
    activity: any,
    conversationId: string | undefined,
    userId: string
  ): Promise<ChannelAccount> {
    if (!conversationId) {
      throw new Error('conversationId is required')
    }
    const client = activity.turnState?.get(activity.adapter.ConnectorClientKey) as ConnectorClient
    if (!client) {
      throw new Error('Client is not available in the context.')
    }
    const teamMember: ChannelAccount = await client.getConversationMember(conversationId, userId)
    return teamMember
  }

  /**
   * Creates a new conversation.
   * @param body - The conversation parameters.
   * @returns The conversation resource response.
   */
  public async createConversationAsync (body: ConversationParameters): Promise<ConversationResourceResponse> {
    const config: AxiosRequestConfig = {
      method: 'post',
      url: '/v3/conversations',
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response: AxiosResponse = await this.client(config)
    return response.data
  }

  /**
   * Replies to an activity in a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async replyToActivityAsync (
    conversationId: string,
    activityId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    if (!conversationId || !activityId) {
      throw new Error('conversationId and activityId are required')
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v3/conversations/${conversationId}/activities/${activityId}`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response = await this.client(config)
    logger.info('Reply to conversation/activity: ', response.data.id!, activityId)
    return response.data
  }

  /**
   * Sends an activity to a conversation.
   * @param conversationId - The ID of the conversation.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async sendToConversationAsync (
    conversationId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    if (!conversationId) {
      throw new Error('conversationId is required')
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v3/conversations/${conversationId}/activities`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Updates an activity in a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async updateActivityAsync (
    conversationId: string,
    activityId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    if (!conversationId || !activityId) {
      throw new Error('conversationId and activityId are required')
    }
    const config: AxiosRequestConfig = {
      method: 'put',
      url: `v3/conversations/${conversationId}/activities/${activityId}`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Deletes an activity from a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @returns A promise that resolves when the activity is deleted.
   */
  public async deleteActivityAsync (
    conversationId: string,
    activityId: string
  ): Promise<void> {
    if (!conversationId || !activityId) {
      throw new Error('conversationId and activityId are required')
    }
    const config: AxiosRequestConfig = {
      method: 'delete',
      url: `v3/conversations/${conversationId}/activities/${activityId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response = await this.client(config)
    return response.data
  }

  // Teams specific methods

  /**
   * Retrieves paged members of a conversation.
   * @param conversationId - The ID of the conversation.
   * @param pageSize - The size of the page.
   * @param continuationToken - The continuation token for pagination.
   * @returns The paged members result.
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
    const response = await this.client(config)
    return response.data
  }

  /**
   * Fetches the list of channels in a team.
   * @param teamId - The ID of the team.
   * @returns The list of channels.
   */
  public async fetchChannelList (teamId: string): Promise<ChannelInfo[]> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}/conversations`
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Fetches the details of a team.
   * @param teamId - The ID of the team.
   * @returns The team details.
   */
  public async fetchTeamDetails (teamId: string): Promise<TeamDetails> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}`
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Fetches the participant information of a meeting.
   * @param meetingId - The ID of the meeting.
   * @param participantId - The ID of the participant.
   * @param tenantId - The ID of the tenant.
   * @returns The participant information.
   */
  public async fetchMeetingParticipant (meetingId: string, participantId: string, tenantId: string): Promise<string> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}/participants/${participantId}`,
      params: { tenantId }
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Fetches the information of a meeting.
   * @param meetingId - The ID of the meeting.
   * @returns The meeting information.
   */
  public async fetchMeetingInfo (meetingId: string): Promise<MeetingInfo> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}`
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Sends a notification to a meeting.
   * @param meetingId - The ID of the meeting.
   * @param notification - The meeting notification.
   * @returns The meeting notification response.
   */
  public async sendMeetingNotification (meetingId: string, notification: MeetingNotification): Promise<MeetingNotificationResponse> {
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v1/meetings/${meetingId}/notification`,
      data: notification
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Sends a message to a list of users.
   * @param activity - The activity object.
   * @param tenantId - The ID of the tenant.
   * @param members - The list of members.
   * @returns The batch operation response.
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
    const response = await this.client(config)
    return response.data
  }

  /**
   * Sends a message to all users in a tenant.
   * @param activity - The activity object.
   * @param tenandId - The ID of the tenant.
   * @returns The batch operation response.
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
    const response = await this.client(config)
    return response.data
  }

  /**
   * Sends a message to all users in a team.
   * @param activity - The activity object.
   * @param tenantId - The ID of the tenant.
   * @param teamId - The ID of the team.
   * @returns The batch operation response.
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
    const response = await this.client(config)
    return response.data
  }

  /**
   * Sends a message to a list of channels.
   * @param activity - The activity object.
   * @param tenantId - The ID of the tenant.
   * @param members - The list of members.
   * @returns The batch operation response.
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
    const response = await this.client(config)
    return response.data
  }

  /**
   * Retrieves the state of an operation.
   * @param operationId - The ID of the operation.
   * @returns The operation state response.
   */
  public async getOperationState (operationId: string): Promise<BatchOperationStateResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/${operationId}`
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Retrieves the failed entries of an operation.
   * @param operationId - The ID of the operation.
   * @returns The failed entries response.
   */
  public async getFailedEntries (operationId: string): Promise<BatchFailedEntriesResponse> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/failedentries/${operationId}`
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Cancels an operation.
   * @param operationId - The ID of the operation.
   * @returns The cancel operation response.
   */
  public async cancelOperation (operationId: string): Promise<CancelOperationResponse> {
    const config: AxiosRequestConfig = {
      method: 'delete',
      url: `v3/batch/conversation/${operationId}`
    }

    const response = await this.client(config)
    return response.data
  }

  /**
     * Uploads an attachment to a conversation.
     * @param conversationId - The ID of the conversation.
     * @param body - The attachment data.
     * @returns The resource response.
     */
  public async uploadAttachment (
    conversationId: string,
    body: AttachmentData
  ): Promise<ResourceResponse> {
    if (conversationId === undefined) {
      throw new Error('conversationId is required')
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v3/conversations/${conversationId}/attachments`,
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Retrieves attachment information by attachment ID.
   * @param attachmentId - The ID of the attachment.
   * @returns The attachment information.
   */
  public async getAttachmentInfo (
    attachmentId: string
  ): Promise<AttachmentInfo> {
    if (attachmentId === undefined) {
      throw new Error('attachmentId is required')
    }
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/attachments/${attachmentId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response = await this.client(config)
    return response.data
  }

  /**
   * Retrieves an attachment by attachment ID and view ID.
   * @param attachmentId - The ID of the attachment.
   * @param viewId - The ID of the view.
   * @returns The attachment as a readable stream.
   */
  public async getAttachment (
    attachmentId: string,
    viewId: string
  ): Promise<NodeJS.ReadableStream> {
    if (attachmentId === undefined) {
      throw new Error('attachmentId is required')
    }
    if (viewId === undefined) {
      throw new Error('viewId is required')
    }
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/attachments/${attachmentId}/views/${viewId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response = await this.client(config)
    return response.data
  }
}
