/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import { Activity, ChannelAccount, ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import { TeamsChannelAccount } from '../activity-extensions/teamsChannelAccount'
import { MeetingInfo } from '../meeting/meetingInfo'
import { MeetingNotification } from '../meeting/meetingNotification'
import { MeetingNotificationResponse } from '../meeting/meetingNotificationResponse'
import { ChannelInfo } from '../activity-extensions/channelInfo'
import { TeamsChannelData } from '../activity-extensions'
import { BatchFailedEntriesResponse, BatchOperationStateResponse, CancelOperationResponse, TeamDetails, TeamsBatchOperationResponse, TeamsMember, TeamsPagedMembersResult } from './teamsConnectorClient.types'
import { ConnectorClient, HttpClient, HttpError, HttpRequestConfig, HttpResponse } from '@microsoft/agents-hosting'
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:connector-client')

function formatHttpErrorMessage (error: HttpError): string {
  const responseData = error.response?.data
  if (responseData === undefined) {
    return error.message
  }

  try {
    const serializedResponseData = JSON.stringify(responseData)
    return serializedResponseData === undefined ? error.message : `${error.message}: ${serializedResponseData}`
  } catch {
    return error.message
  }
}

interface ConversationList {
  conversations?: ChannelInfo[]
}
/**
 * A client for interacting with Microsoft Teams APIs.
 * Extends the ConnectorClient class to provide Teams-specific functionalities.
 */
export class TeamsConnectorClient {
  private _httpClient: HttpClient
  constructor (private client: ConnectorClient) {
    this._httpClient = client.httpClient
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
      throw ExceptionHelper.generateException(Error, Errors.MissingActivityParameter)
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
      throw ExceptionHelper.generateException(Error, Errors.OnlyValidInTeamsScope)
    }
    if (!userId) {
      throw ExceptionHelper.generateException(Error, Errors.UserIdRequired)
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
    const config: HttpRequestConfig = {
      method: 'get',
      url: `/v3/conversations/${conversationId}/members/${userId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response: HttpResponse<ChannelAccount> = await this.executeRequest<ChannelAccount>(config)
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
      throw ExceptionHelper.generateException(Error, Errors.ConversationIdRequired)
    }
    const client : ConnectorClient = activity.turnState?.get(activity.adapter.ConnectorClientKey)
    if (!client) {
      throw ExceptionHelper.generateException(Error, Errors.ClientNotAvailable)
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
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v3/conversations/${conversationId}/pagedMembers`,
      params: {
        pageSize: String(pageSize),
        continuationToken
      }
    }
    const response = await this.executeRequest<TeamsPagedMembersResult>(config)
    return response.data
  }

  /**
   * Fetches the list of channels in a team.
   * @param teamId - The ID of the team.
   * @returns An array of ChannelInfo objects representing the channels.
   */
  public async fetchChannelList (teamId: string): Promise<ChannelInfo[]> {
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}/conversations`
    }
    const response = await this.executeRequest<ConversationList>(config)
    const convList: ConversationList = response.data
    return convList.conversations || []
  }

  /**
   * Fetches the details of a team.
   * @param teamId - The ID of the team.
   * @returns A TeamDetails object containing the team details.
   */
  public async fetchTeamDetails (teamId: string): Promise<TeamDetails> {
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v3/teams/${teamId}`
    }
    const response = await this.executeRequest<TeamDetails>(config)
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
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}/participants/${participantId}`,
      params: { tenantId }
    }
    const response = await this.executeRequest<string>(config)
    return response.data
  }

  /**
   * Fetches information about a meeting.
   * @param meetingId - The ID of the meeting.
   * @returns A MeetingInfo object containing the meeting information.
   */
  public async fetchMeetingInfo (meetingId: string): Promise<MeetingInfo> {
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v1/meetings/${meetingId}`
    }
    const response = await this.executeRequest<MeetingInfo>(config)
    return response.data
  }

  /**
   * Sends a notification to a meeting.
   * @param meetingId - The ID of the meeting.
   * @param notification - The notification to send.
   * @returns A MeetingNotificationResponse object containing the response.
   */
  public async sendMeetingNotification (meetingId: string, notification: MeetingNotification): Promise<MeetingNotificationResponse> {
    const config: HttpRequestConfig = {
      method: 'post',
      url: `v1/meetings/${meetingId}/notification`,
      data: notification
    }
    const response = await this.executeRequest<MeetingNotificationResponse>(config)
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
    const config: HttpRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/users',
      data: content
    }
    const response = await this.executeRequest<TeamsBatchOperationResponse>(config)
    return response.data
  }

  /**
   * Sends a message to all users in a tenant.
   * @param activity - The activity to send.
   * @param tenantId - The tenant ID.
   * @returns A TeamsBatchOperationResponse object containing the response.
   */
  public async sendMessageToAllUsersInTenant (activity: Activity, tenantId: string): Promise<TeamsBatchOperationResponse> {
    const content = {
      activity,
      tenantId
    }
    const config: HttpRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/tenant',
      data: content
    }
    const response = await this.executeRequest<TeamsBatchOperationResponse>(config)
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
    const config: HttpRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/team',
      data: content
    }
    const response = await this.executeRequest<TeamsBatchOperationResponse>(config)
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
    const config: HttpRequestConfig = {
      method: 'post',
      url: 'v3/batch/conversation/channels',
      data: content
    }
    const response = await this.executeRequest<TeamsBatchOperationResponse>(config)
    return response.data
  }

  /**
   * Retrieves the state of a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A BatchOperationStateResponse object containing the operation state.
   */
  public async getOperationState (operationId: string): Promise<BatchOperationStateResponse> {
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/${operationId}`
    }
    const response = await this.executeRequest<BatchOperationStateResponse>(config)
    return response.data
  }

  /**
   * Retrieves the failed entries of a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A BatchFailedEntriesResponse object containing the failed entries.
   */
  public async getFailedEntries (operationId: string): Promise<BatchFailedEntriesResponse> {
    const config: HttpRequestConfig = {
      method: 'get',
      url: `v3/batch/conversation/failedentries/${operationId}`
    }
    const response = await this.executeRequest<BatchFailedEntriesResponse>(config)
    return response.data
  }

  /**
   * Cancels a batch operation.
   * @param operationId - The ID of the operation.
   * @returns A CancelOperationResponse object containing the response.
   */
  public async cancelOperation (operationId: string): Promise<CancelOperationResponse> {
    const config: HttpRequestConfig = {
      method: 'delete',
      url: `v3/batch/conversation/${operationId}`
    }

    const response = await this.executeRequest<CancelOperationResponse>(config)
    return response.data
  }

  private async executeRequest<T = unknown> (config: HttpRequestConfig): Promise<HttpResponse<T>> {
    const { method, url, data, headers, params } = config
    const { Authorization, authorization, ...headersToLog } = { ...this._httpClient.defaultHeaders, ...headers } as Record<string, string>
    logger.debug('Request: ', {
      host: this._httpClient.baseURL,
      url,
      data,
      method,
      params,
      headers: headersToLog
    })

    try {
      const response = await this._httpClient.request<T>(config)
      logger.debug('Response: ', {
        status: response.status,
        statusText: response.statusText,
        host: this._httpClient.baseURL,
        url: response.config?.url,
        data: response.config?.data,
        method: response.config?.method,
      })
      return response
    } catch (error) {
      if (error instanceof HttpError) {
        const message = formatHttpErrorMessage(error)
        logger.debug('Response error: ', {
          host: this._httpClient.baseURL,
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message,
          stack: error.stack,
        })

        Object.assign(error, {
          host: this._httpClient.baseURL,
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message,
        })

        throw error
      }
      throw error
    }
  }
}
