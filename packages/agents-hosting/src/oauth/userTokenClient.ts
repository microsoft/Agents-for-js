// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import axios, { AxiosInstance } from 'axios'
import { SigningResource } from './signingResource'
import { Activity } from '@microsoft/agents-activity'
import { debug } from '../logger'
import { TokenExchangeRequest } from './tokenExchangeRequest'
import { normalizeTokenExchangeState } from '../activityWireCompat'
import { TokenRequestStatus, TokenResponse } from './tokenResponse'
import { getProductInfo } from '../getProductInfo'

const logger = debug('agents:user-token-client')

/**
 * Client for managing user tokens.
 */
export class UserTokenClient {
  client: AxiosInstance

  /**
   * Creates a new instance of UserTokenClient.
   * @param token The token to use for authentication.
   */
  constructor (token: string) {
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
   * @param appId The application ID.
   * @param cnxName The connection name.
   * @param activity The activity.
   * @returns A promise that resolves to the signing resource.
   */
  async getSignInResource (appId: string, cnxName: string, activity: Activity) : Promise<SigningResource> {
    try {
      const tokenExchangeState = {
        connectionName: cnxName,
        conversation: activity.getConversationReference(),
        relatesTo: activity.RelatesTo,
        msAppId: appId
      }
      const tokenExchangeStateNormalized = normalizeTokenExchangeState(tokenExchangeState)
      const state = Buffer.from(JSON.stringify(tokenExchangeStateNormalized)).toString('base64')
      const params = { state }
      const response = await this.client.get('/api/botsignin/GetSignInResource', { params })
      return response.data as SigningResource
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
}
