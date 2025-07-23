/** * Copyright (c) Microsoft Corporation. All rights reserved. * Licensed under the MIT License. */
import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import { AuthConfiguration } from '../auth/authConfiguration'
import { AuthProvider } from '../auth/authProvider'
import { debug } from '@microsoft/agents-activity/logger'
import { Activity, ChannelAccount, ConversationParameters } from '@microsoft/agents-activity'
import { ConversationsResult } from './conversationsResult'
import { ConversationResourceResponse } from './conversationResourceResponse'
import { ResourceResponse } from './resourceResponse'
import { AttachmentInfo } from './attachmentInfo'
import { AttachmentData } from './attachmentData'
import { normalizeOutgoingActivity } from '../activityWireCompat'
import { getProductInfo } from '../getProductInfo'
import { HeaderPropagation, HeaderPropagationCollection } from '../headerPropagation'
const logger = debug('agents:connector-client')

export { getProductInfo }

/**
 * ConnectorClient is a client for interacting with the Microsoft Connector API.
 */
export class ConnectorClient {
  protected readonly _axiosInstance: AxiosInstance

  /**
   * Private constructor for the ConnectorClient.
   * @param axInstance - The AxiosInstance to use for HTTP requests.
   */
  protected constructor (axInstance: AxiosInstance) {
    this._axiosInstance = axInstance
    this._axiosInstance.interceptors.request.use((config) => {
      const { method, url, data, headers, params } = config
      // Clone headers and remove Authorization before logging
      const { Authorization, authorization, ...headersToLog } = headers || {}
      logger.debug('Request: ', {
        host: this._axiosInstance.getUri(),
        url,
        data,
        method,
        params,
        headers: headersToLog
      })
      return config
    })
    this._axiosInstance.interceptors.response.use(
      (config) => {
        const { status, statusText, config: requestConfig } = config
        logger.debug('Response: ', {
          status,
          statusText,
          host: this._axiosInstance.getUri(),
          url: requestConfig?.url,
          data: config.config.data,
          method: requestConfig?.method,
        })
        return config
      },
      (error) => {
        const { code, message, stack, response } = error
        const errorDetails = {
          code,
          host: this._axiosInstance.getUri(),
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message: message + JSON.stringify(response?.data),
          stack,
        }
        return Promise.reject(errorDetails)
      }
    )
  }

  public get axiosInstance (): AxiosInstance {
    return this._axiosInstance
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
    const headerPropagation = headers ?? new HeaderPropagation({ 'User-Agent': '' })
    headerPropagation.concat({ 'User-Agent': getProductInfo() })
    headerPropagation.override({ Accept: 'application/json' })

    const axiosInstance = axios.create({
      baseURL,
      headers: headerPropagation.outgoing,
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
  public async getConversations (continuationToken?: string): Promise<ConversationsResult> {
    const config: AxiosRequestConfig = {
      method: 'get',
      url: '/v3/conversations',
      params: continuationToken ? { continuationToken } : undefined
    }
    const response = await this._axiosInstance(config)
    return response.data
  }

  public async getConversationMember (userId: string, conversationId: string): Promise<ChannelAccount> {
    if (!userId || !conversationId) {
      throw new Error('userId and conversationId are required')
    }
    const config: AxiosRequestConfig = {
      method: 'get',
      url: `v3/conversations/${conversationId}/members/${userId}`,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const response = await this._axiosInstance(config)
    return response.data
  }

  /**
   * Creates a new conversation.
   * @param body - The conversation parameters.
   * @returns The conversation resource response.
   */
  public async createConversation (body: ConversationParameters): Promise<ConversationResourceResponse> {
    // const payload = normalizeOutgoingConvoParams(body)
    const config: AxiosRequestConfig = {
      method: 'post',
      url: '/v3/conversations',
      headers: {
        'Content-Type': 'application/json'
      },
      data: body
    }
    const response: AxiosResponse = await this._axiosInstance(config)
    return response.data
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
    const response = await this._axiosInstance(config)
    logger.info('Reply to conversation/activity: ', response.data.id!, activityId)
    return response.data
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
    const response = await this._axiosInstance(config)
    return response.data
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
    const response = await this._axiosInstance(config)
    return response.data
  }

  /**
   * Deletes an activity from a conversation.
   * @param conversationId - The ID of the conversation.
   * @param activityId - The ID of the activity.
   * @returns A promise that resolves when the activity is deleted.
   */
  public async deleteActivity (
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
    const response = await this._axiosInstance(config)
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
    const response = await this._axiosInstance(config)
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
    const response = await this._axiosInstance(config)
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
    const response = await this._axiosInstance(config)
    return response.data
  }
}
