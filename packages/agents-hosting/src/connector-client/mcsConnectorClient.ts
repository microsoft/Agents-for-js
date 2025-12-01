/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
import { debug } from '@microsoft/agents-activity/logger'
import { Activity, ChannelAccount, ConversationParameters } from '@microsoft/agents-activity'
import { ResourceResponse } from './resourceResponse'
import { normalizeOutgoingActivity } from '../activityWireCompat'
import { getProductInfo } from '../getProductInfo'
import { HeaderPropagation, HeaderPropagationCollection } from '../headerPropagation'
import { ConnectorClientBase } from './connectorClient'
import { AttachmentData } from './attachmentData'
import { AttachmentInfo } from './attachmentInfo'
import { ConversationResourceResponse } from './conversationResourceResponse'
import { ConversationsResult } from './conversationsResult'
const logger = debug('agents:mcs-connector-client')

export { getProductInfo }

/**
 * This is an ConnectorClientBase suited for communicating with Microsoft Copilot Studio via a Power Apps Connector request.
 * @remarks
 * The only supported operations are sendToConversation and replyToActivity.
 */
export class MCSConnectorClient implements ConnectorClientBase {
  protected readonly _axiosInstance: AxiosInstance

  /**
   * Private constructor for the MCSConnectorClient.
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

  getConversations (continuationToken?: string): Promise<ConversationsResult> {
    throw new Error('Method not implemented')
  }

  getConversationMember (userId: string, conversationId: string): Promise<ChannelAccount> {
    throw new Error('Method not implemented.')
  }

  createConversation (body: ConversationParameters): Promise<ConversationResourceResponse> {
    throw new Error('Method not implemented.')
  }

  getAttachmentInfo (attachmentId: string): Promise<AttachmentInfo> {
    throw new Error('Method not implemented.')
  }

  getAttachment (attachmentId: string, viewId: string): Promise<NodeJS.ReadableStream> {
    throw new Error('Method not implemented.')
  }

  updateActivity (conversationId: string, activityId: string, body: Activity): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  deleteActivity (conversationId: string, activityId: string): Promise<void> {
    throw new Error('Method not implemented.')
  }

  public uploadAttachment (conversationId: string, body: AttachmentData): Promise<ResourceResponse> {
    throw new Error('Method not implemented.')
  }

  public get axiosInstance (): AxiosInstance {
    return this._axiosInstance
  }

  /**
   * Creates a new instance of MCSConnectorClient.
   * @param baseURL - The base URL for the API.
   * @param headers - Optional headers to propagate in the request.
   * @returns A new instance of MCSConnectorClient.
   */
  static createClient (
    baseURL: string,
    headers?: HeaderPropagationCollection
  ): MCSConnectorClient {
    const headerPropagation = headers ?? new HeaderPropagation({ 'User-Agent': '' })
    headerPropagation.concat({ 'User-Agent': getProductInfo() })
    headerPropagation.override({
      Accept: 'application/json',
      'Content-Type': 'application/json', // Required by transformRequest
    })

    const axiosInstance = axios.create({
      baseURL,
      headers: headerPropagation.outgoing,
    })

    return new MCSConnectorClient(axiosInstance)
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

    return this.sendToConversation(conversationId, body)
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
      data: normalizeOutgoingActivity(body)
    }
    const response = await this._axiosInstance(config)
    return response.data
  }
}
