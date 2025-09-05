// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import axios, { AxiosInstance } from 'axios'
import { ConversationReference } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-activity/logger'
import { normalizeTokenExchangeState } from '../activityWireCompat'
import { AadResourceUrls, SignInResource, TokenExchangeRequest, TokenOrSinginResourceResponse, TokenResponse, TokenStatus } from './userTokenClient.types'
import { getProductInfo } from '../getProductInfo'

const logger = debug('agents:user-token-client')

/**
 * Client for managing user tokens.
 */
export class UserTokenClient {
  client: AxiosInstance
  /**
   * Creates a new instance of UserTokenClient.
   * @param msAppId The Microsoft application ID.
   */
  constructor (private msAppId: string) {
    const baseURL = 'https://api.botframework.com'
    this.client = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'User-Agent': getProductInfo(),
      }
    })

    this.client.interceptors.request.use((config) => {
      const { method, url, data, headers, params } = config
      const { Authorization, authorization, ...headersToLog } = headers || {}
      logger.debug('Request: ', {
        host: this.client.getUri(),
        url,
        data,
        method,
        params,
        headers: headersToLog
      })
      return config
    })

    this.client.interceptors.response.use(
      (config) => {
        const { status, statusText, config: requestConfig, headers } = config
        const { Authorization, authorization, ...headersToLog } = headers || {}
        const { token, ...redactedData } = requestConfig?.data || {}
        logger.debug('Response: ', {
          status,
          statusText,
          host: this.client.getUri(),
          url: requestConfig?.url,
          data: redactedData,
          method: requestConfig?.method,
          headers: headersToLog
        })
        return config
      },
      (error) => {
        const { code, status, message, stack, response } = error
        const { headers } = response || {}
        const errorDetails = {
          code,
          host: this.client.getUri(),
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message: message + JSON.stringify(response?.data),
          headers,
          stack,
        }
        logger.debug('Response error: ', errorDetails)
        if (errorDetails.url === '/api/usertoken/GetToken' && status !== 404) {
          return Promise.reject(errorDetails)
        }
      })
  }

  /**
   * Gets the user token.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @param userId The user ID.
   * @param code The optional code.
   * @returns A promise that resolves to the user token.
   */
  async getUserToken (connectionName: string, channelId: string, userId: string, code?: string) : Promise<TokenResponse> {
    const params = { connectionName, channelId, userId, code }
    const response = await this.client.get('/api/usertoken/GetToken', { params })
    if (response?.data) {
      return response.data as TokenResponse
    }
    return { token: undefined }
  }

  /**
   * Signs the user out.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  async signOut (userId: string, connectionName: string, channelId: string) : Promise<void> {
    const params = { userId, connectionName, channelId }
    const response = await this.client.delete('/api/usertoken/SignOut', { params })
    if (response.status !== 200) {
      throw new Error('Failed to sign out')
    }
  }

  /**
   * Gets the sign-in resource.
   * @param msAppId The application ID.
   * @param connectionName The connection name.
   * @param conversation The conversation reference.
   * @param relatesTo Optional. The related conversation reference.
   * @returns A promise that resolves to the signing resource.
   */
  async getSignInResource (msAppId: string, connectionName: string, conversation: ConversationReference, relatesTo?: ConversationReference) : Promise<SignInResource> {
    const tokenExchangeState = {
      connectionName,
      conversation,
      relatesTo,
      msAppId
    }
    const tokenExchangeStateNormalized = normalizeTokenExchangeState(tokenExchangeState)
    const state = Buffer.from(JSON.stringify(tokenExchangeStateNormalized)).toString('base64')
    const params = { state }
    const response = await this.client.get('/api/botsignin/GetSignInResource', { params })
    return response.data as SignInResource
  }

  /**
   * Exchanges the token.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @param tokenExchangeRequest The token exchange request.
   * @returns A promise that resolves to the exchanged token.
   */
  async exchangeTokenAsync (userId: string, connectionName: string, channelId: string, tokenExchangeRequest: TokenExchangeRequest) : Promise<TokenResponse> {
    const params = { userId, connectionName, channelId }
    const response = await this.client.post('/api/usertoken/exchange', tokenExchangeRequest, { params })
    if (response?.data) {
      return response.data as TokenResponse
    } else {
      return { token: undefined }
    }
  }

  /**
   * Gets the token or sign-in resource.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @param conversation The conversation reference.
   * @param relatesTo The related conversation reference.
   * @param code The code.
   * @param finalRedirect The final redirect URL.
   * @param fwdUrl The forward URL.
   * @returns A promise that resolves to the token or sign-in resource response.
   */
  async getTokenOrSignInResource (userId: string, connectionName: string, channelId: string, conversation: ConversationReference, relatesTo: ConversationReference, code: string, finalRedirect: string = '', fwdUrl: string = '') : Promise<TokenOrSinginResourceResponse> {
    const state = Buffer.from(JSON.stringify({ conversation, relatesTo, connectionName, msAppId: this.msAppId })).toString('base64')
    const params = { userId, connectionName, channelId, state, code, finalRedirect, fwdUrl }
    const response = await this.client.get('/api/usertoken/GetTokenOrSignInResource', { params })
    return response.data as TokenOrSinginResourceResponse
  }

  /**
   * Gets the token status.
   * @param userId The user ID.
   * @param channelId The channel ID.
   * @param include The optional include parameter.
   * @returns A promise that resolves to the token status.
   */
  async getTokenStatus (userId: string, channelId: string, include: string = null!): Promise<TokenStatus[]> {
    const params = { userId, channelId, include }
    const response = await this.client.get('/api/usertoken/GetTokenStatus', { params })
    return response.data as TokenStatus[]
  }

  /**
   * Gets the AAD tokens.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @param resourceUrls The resource URLs.
   * @returns A promise that resolves to the AAD tokens.
   */
  async getAadTokens (userId: string, connectionName: string, channelId: string, resourceUrls: AadResourceUrls) : Promise<Record<string, TokenResponse>> {
    const params = { userId, connectionName, channelId }
    const response = await this.client.post('/api/usertoken/GetAadTokens', resourceUrls, { params })
    return response.data as Record<string, TokenResponse>
  }

  public updateAuthToken (token: string): void {
    this.client.defaults.headers.common.Authorization = `Bearer ${token}`
  }
}
