// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import axios, { AxiosInstance } from 'axios'
import { ConversationReference } from '@microsoft/agents-activity'
import { debug } from '../logger'
import { normalizeTokenExchangeState } from '../activityWireCompat'
import { SignInResource, TokenExchangeRequest, TokenOrSinginResourceResponse, TokenRequestStatus, TokenResponse, TokenStatus } from './userTokenClient.types'
import { getProductInfo } from '../getProductInfo'

const logger = debug('agents:user-token-client')

/**
 * Client for managing user tokens.
 */
export class UserTokenClient {
  client: AxiosInstance
  msAppId: string
  /**
   * Creates a new instance of UserTokenClient.
   * @param token The token to use for authentication.
   * @param msAppId The Microsoft application ID.
   */
  constructor (token: string, appId: string) {
    this.msAppId = appId
    const baseURL = 'https://api.botframework.com'
    const axiosInstance = axios.create({
      baseURL,
      headers: {
        Accept: 'application/json',
        'User-Agent': getProductInfo(),
      }
    })
    axiosInstance.defaults.headers.common.Authorization = `Bearer ${token}`
    this.client = axiosInstance
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
    try {
      const params = { connectionName, channelId, userId, code }
      const response = await this.client.get('/api/usertoken/GetToken', { params })
      return { ...response.data, status: TokenRequestStatus.Success }
    } catch (error: any) {
      if (error.response?.status !== 404) {
        logger.error(error)
      }
      return {
        status: TokenRequestStatus.Failed,
        token: undefined
      }
    }
  }

  /**
   * Signs the user out.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  async signOut (userId: string, connectionName: string, channelId: string) : Promise<void> {
    try {
      const params = { userId, connectionName, channelId }
      const response = await this.client.delete('/api/usertoken/SignOut', { params })
      if (response.status !== 200) {
        throw new Error('Failed to sign out')
      }
    } catch (error: any) {
      logger.error(error)
      throw new Error('Failed to sign out')
    }
  }

  /**
   * Gets the sign-in resource.
   * @param msAppId The application ID.
   * @param connectionName The connection name.
   * @param activity The activity.
   * @returns A promise that resolves to the signing resource.
   */
  async getSignInResource (msAppId: string, connectionName: string, conversation: ConversationReference, relatesTo?: ConversationReference) : Promise<SignInResource> {
    try {
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
    } catch (error: any) {
      logger.error(error)
      throw error
    }
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
    try {
      const params = { userId, connectionName, channelId }
      const response = await this.client.post('/api/usertoken/exchange', tokenExchangeRequest, { params })
      return { ...response.data, status: TokenRequestStatus.Success }
    } catch (error: any) {
      logger.error(error)
      return { status: TokenRequestStatus.Failed, token: undefined }
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

  async getTokenStatus (userId: string, channelId: string, include: string = null!): Promise<TokenStatus> {
    const params = { userId, channelId, include }
    const response = await this.client.get('/api/usertoken/GetTokenStatus', { params })
    return response.data as TokenStatus
  }
}
