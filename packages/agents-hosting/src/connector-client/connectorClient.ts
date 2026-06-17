/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from '../auth/authConfiguration'
import { AuthProvider } from '../auth/authProvider'
import { debug } from '@microsoft/agents-telemetry'
import { Activity, ChannelAccount, ConversationParameters, RoleTypes, Channels, ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import { ConversationsResult } from './conversationsResult'
import { ConversationResourceResponse } from './conversationResourceResponse'
import { ResourceResponse } from './resourceResponse'
import { AttachmentInfo } from './attachmentInfo'
import { AttachmentData } from './attachmentData'
import { normalizeOutgoingActivity } from '../activityWireCompat'
import { applyUserAgentHeader, getProductInfo } from '../getProductInfo'
import { HeaderPropagation, HeaderPropagationCollection } from '../headerPropagation'
import { trace } from '@microsoft/agents-telemetry'
import { ConnectorClientTraceDefinitions } from '../observability'
import { parseIntEnv } from '../utils/env'
import { HttpClient, HttpRequestConfig, HttpResponse, HttpError } from '../httpClient'

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

export { getProductInfo }

/**
 * ConnectorClient is a client for interacting with the Microsoft Connector API.
 */
export class ConnectorClient {
  protected readonly _httpClient: HttpClient

  /**
   * Private constructor for the ConnectorClient.
   * @param httpClient - The HttpClient instance to use for HTTP requests.
   */
  protected constructor (httpClient: HttpClient) {
    this._httpClient = httpClient
  }

  public get httpClient (): HttpClient {
    return this._httpClient
  }

  /**
   * Creates a new instance of ConnectorClient with authentication.
   * @param baseURL - The base URL for the API.
   * @param authConfig - The authentication configuration.
   * @param authProvider - The authentication provider.
   * @param scope - The scope for the authentication token.
   * @param headers - Optional headers to propagate in the request.
   * @returns A new instance of ConnectorClient.
   */
  static async createClientWithAuth (
    baseURL: string,
    authConfig: AuthConfiguration,
    authProvider: AuthProvider,
    scope: string,
    headers?: HeaderPropagationCollection
  ): Promise<ConnectorClient> {
    const token = await authProvider.getAccessToken(authConfig, scope)
    return this.createClientWithToken(baseURL, token, headers)
  }

  /**
   * Creates a new instance of ConnectorClient with token.
   * @param baseURL - The base URL for the API.
   * @param token - The authentication token.
   * @param headers - Optional headers to propagate in the request.
   * @returns A new instance of ConnectorClient.
   */
  static createClientWithToken (
    baseURL: string,
    token: string,
    headers?: HeaderPropagationCollection
  ): ConnectorClient {
    const headerPropagation = headers ?? new HeaderPropagation({})
    applyUserAgentHeader(headerPropagation)
    headerPropagation.override({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })

    const clientHeaders: Record<string, string> = { ...headerPropagation.outgoing }
    if (token && token.length > 1) {
      clientHeaders.Authorization = `Bearer ${token}`
    }

    const httpClient = new HttpClient({
      baseURL,
      headers: clientHeaders,
    })

    return new ConnectorClient(httpClient)
  }

  /**
   * Retrieves a list of conversations.
   * @param continuationToken - The continuation token for pagination.
   * @returns A list of conversations.
   */
  public async getConversations (continuationToken?: string): Promise<ConversationsResult> {
    return trace(ConnectorClientTraceDefinitions.getConversations, async ({ record }) => {
      const config: HttpRequestConfig = {
        method: 'get',
        url: '/v3/conversations',
        params: continuationToken ? { continuationToken } : undefined
      }
      const response = await this.executeRequest<ConversationsResult>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  public async getConversationMember (userId: string, conversationId: string): Promise<ChannelAccount> {
    return trace(ConnectorClientTraceDefinitions.getConversationMember, async ({ record }) => {
      if (!userId || !conversationId) {
        throw ExceptionHelper.generateException(Error, Errors.UserIdAndConversationIdRequired)
      }
      const config: HttpRequestConfig = {
        method: 'get',
        url: `v3/conversations/${conversationId}/members/${userId}`,
        headers: {
          'Content-Type': 'application/json'
        }
      }
      const response = await this.executeRequest<ChannelAccount>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  /**
   * Creates a new conversation.
   * @param body - The conversation parameters.
   * @returns The conversation resource response.
   */
  public async createConversation (body: ConversationParameters): Promise<ConversationResourceResponse> {
    return trace(ConnectorClientTraceDefinitions.createConversation, async ({ record }) => {
      const payload = {
        ...body,
        activity: normalizeOutgoingActivity(body.activity)
      }
      const config: HttpRequestConfig = {
        method: 'post',
        url: '/v3/conversations',
        headers: {
          'Content-Type': 'application/json'
        },
        data: payload
      }
      const response = await this.executeRequest<ConversationResourceResponse>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  /**
   * Replies to an activity in a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async replyToActivity (
    conversationId: string,
    activityId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    return trace(ConnectorClientTraceDefinitions.replyToActivity, async ({ record }) => {
      logger.debug(`Replying to activity: ${activityId} in conversation: ${conversationId}`)
      record({ conversationId, activityId })

      if (!conversationId || !activityId) {
        throw ExceptionHelper.generateException(Error, Errors.ConversationIdAndActivityIdRequired)
      }

      const trimmedConversationId: string = this.conditionallyTruncateConversationId(conversationId, body)

      const config: HttpRequestConfig = {
        method: 'post',
        url: `v3/conversations/${trimmedConversationId}/activities/${encodeURIComponent(activityId)}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: normalizeOutgoingActivity(body),
        ...(body.channelId === Channels.Msteams && body.isTargetedActivity() ? { params: { isTargetedActivity: 'true' } } : {})
      }
      const response = await this.executeRequest<ResourceResponse>(config)
      record({ httpStatusCode: response.status?.toString() })
      logger.info('Reply to conversation/activity: ', response.data.id!, activityId)
      return response.data
    })
  }

  /**
   * Trim and sanitize the conversationId when creating the URL for agentic calls in agents channels.
   * @param conversationId The ID of the conversation to potentially truncate.
   * @param activity The activity object used to determine if truncation is necessary.
   * @returns The original conversationId for non-agents channels/non-agentic roles, otherwise a trimmed and sanitized value.
   */
  private conditionallyTruncateConversationId (conversationId: string, activity: Activity): string {
    if (
      activity.channelIdChannel === Channels.Agents &&
      (activity.from?.role === RoleTypes.AgenticIdentity || activity.from?.role === RoleTypes.AgenticUser)) {
      const maxLength = parseIntEnv(process.env.MAX_APX_CONVERSATION_ID_LENGTH, 150)
      const trimmedConversationId = conversationId.length > maxLength ? conversationId.substring(0, maxLength) : conversationId

      return trimmedConversationId.replace(/[/\\#?]/g, '_')
    } else {
      return conversationId
    }
  }

  /**
   * Sends an activity to a conversation.
   * @param conversationId - The ID of the conversation.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async sendToConversation (
    conversationId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    return trace(ConnectorClientTraceDefinitions.sendToConversation, async ({ record }) => {
      logger.debug(`Send to conversation: ${conversationId} activity: ${body.id}`)
      if (!conversationId) {
        throw ExceptionHelper.generateException(Error, Errors.ConversationIdRequired)
      }

      record({ conversationId })

      const trimmedConversationId: string = this.conditionallyTruncateConversationId(conversationId, body)

      const config: HttpRequestConfig = {
        method: 'post',
        url: `v3/conversations/${trimmedConversationId}/activities`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: normalizeOutgoingActivity(body),
        ...(body.channelId === Channels.Msteams && body.isTargetedActivity() ? { params: { isTargetedActivity: 'true' } } : {})

      }
      const response = await this.executeRequest<ResourceResponse>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  /**
   * Updates an activity in a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @param body - The activity object.
   * @returns The resource response.
   */
  public async updateActivity (
    conversationId: string,
    activityId: string,
    body: Activity
  ): Promise<ResourceResponse> {
    return trace(ConnectorClientTraceDefinitions.updateActivity, async ({ record }) => {
      if (!conversationId || !activityId) {
        throw ExceptionHelper.generateException(Error, Errors.ConversationIdAndActivityIdRequired)
      }
      record({ conversationId, activityId })
      const config: HttpRequestConfig = {
        method: 'put',
        url: `v3/conversations/${conversationId}/activities/${activityId}`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: normalizeOutgoingActivity(body),
        ...(body.channelId === Channels.Msteams && body.isTargetedActivity() ? { params: { isTargetedActivity: 'true' } } : {})
      }
      const response = await this.executeRequest<ResourceResponse>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  /**
   * Deletes an activity from a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @param isTargetedActivity - When true, appends ?isTargetedActivity=true to the request URL.
   * @returns A promise that resolves when the activity is deleted.
   */
  public async deleteActivity (
    conversationId: string,
    activityId: string,
    isTargetedActivity?: boolean
  ): Promise<void> {
    return trace(ConnectorClientTraceDefinitions.deleteActivity, async ({ record }) => {
      record({ conversationId, activityId })

      if (!conversationId || !activityId) {
        throw ExceptionHelper.generateException(Error, Errors.ConversationIdAndActivityIdRequired)
      }
      const config: HttpRequestConfig = {
        method: 'delete',
        url: `v3/conversations/${conversationId}/activities/${activityId}`,
        headers: {
          'Content-Type': 'application/json'
        },
        ...(isTargetedActivity ? { params: { isTargetedActivity: 'true' } } : {})
      }
      const response = await this.executeRequest<void>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
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
    return trace(ConnectorClientTraceDefinitions.uploadAttachment, async ({ record }) => {
      record({ conversationId })
      if (conversationId === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.ConversationIdRequired)
      }
      const config: HttpRequestConfig = {
        method: 'post',
        url: `v3/conversations/${conversationId}/attachments`,
        headers: {
          'Content-Type': 'application/json'
        },
        data: body
      }
      const response = await this.executeRequest<ResourceResponse>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
  }

  /**
   * Retrieves attachment information by attachment ID.
   * @param attachmentId - The ID of the attachment.
   * @returns The attachment information.
   */
  public async getAttachmentInfo (
    attachmentId: string
  ): Promise<AttachmentInfo> {
    return trace(ConnectorClientTraceDefinitions.getAttachmentInfo, async ({ record }) => {
      record({ attachmentId })
      if (attachmentId === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.AttachmentIdRequired)
      }
      const config: HttpRequestConfig = {
        method: 'get',
        url: `v3/attachments/${attachmentId}`,
        headers: {
          'Content-Type': 'application/json'
        }
      }
      const response = await this.executeRequest<AttachmentInfo>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
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
    return trace(ConnectorClientTraceDefinitions.getAttachment, async ({ record }) => {
      record({ attachmentId, viewId })
      if (attachmentId === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.AttachmentIdRequired)
      }
      if (viewId === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.ViewIdRequired)
      }
      const config: HttpRequestConfig = {
        method: 'get',
        url: `v3/attachments/${attachmentId}/views/${viewId}`,
        headers: {
          'Content-Type': 'application/json'
        },
        responseType: 'stream'
      }
      const response = await this.executeRequest<NodeJS.ReadableStream>(config)
      record({ httpStatusCode: response.status?.toString() })
      return response.data
    })
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
