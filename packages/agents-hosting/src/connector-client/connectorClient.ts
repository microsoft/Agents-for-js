/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AuthConfiguration } from '../auth/authConfiguration'
import { AuthProvider } from '../auth/authProvider'
import { debug } from '../logger'
import { Activity, ConversationParameters } from '@microsoft/agents-activity'
import { ConversationsResult } from './conversationsResult'
import { ConversationResourceResponse } from './conversationResourceResponse'
import { ResourceResponse } from './resourceResponse'
import { AttachmentInfo } from './attachmentInfo'
import { AttachmentData } from './attachmentData'
import { normalizeOutgoingActivity } from '../activityWireCompat'
import { getProductInfo } from '../getProductInfo'
const logger = debug('agents:connector-client')

export { getProductInfo }

/**
 * ConnectorClient is a client for interacting with the Microsoft Connector API.
 */
export class ConnectorClient {
  protected readonly client: AxiosInstance

  /**
   * Private constructor for the ConnectorClient.
   * @param client - The AxiosInstance to use for HTTP requests.
   */
  protected constructor (client: AxiosInstance) {
    this.client = client
    this.client.interceptors.response.use(
      (config) => {
        const { status, statusText, config: requestConfig } = config
        logger.debug('Response: ', {
          status,
          statusText,
          host: this.client.getUri(),
          url: requestConfig?.url,
          data: config.config.data,
          method: requestConfig?.method,
        })
        return config
      },
      (error) => {
        const { code, message, stack } = error
        const errorDetails = {
          code,
          host: this.client.getUri(),
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
        Accept: 'application/json',
        'User-Agent': getProductInfo(),
      },
      transformRequest: [
        (data, headers) => {
          return JSON.stringify(normalizeOutgoingActivity(data))
        }]
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
   * Creates a new conversation.
   * @param body - The conversation parameters.
   * @returns The conversation resource response.
   */
  public async createConversationAsync (body: ConversationParameters): Promise<ConversationResourceResponse> {
    // const payload = normalizeOutgoingConvoParams(body)
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
    logger.debug(`Replying to activity: ${activityId} in conversation: ${conversationId}`)
    if (!conversationId || !activityId) {
      throw new Error('conversationId and activityId are required')
    }
    const config: AxiosRequestConfig = {
      method: 'post',
      url: `v3/conversations/${conversationId}/activities/${encodeURIComponent(activityId)}`,
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
    logger.debug(`Send to conversation: ${conversationId} activity: ${body.id}`)
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
