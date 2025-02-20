// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import axios, { AxiosInstance } from 'axios'
import { SigningResource } from './signingResource'
import { TokenExchangeRequest } from './tokenExchangeRequest'
import { Activity } from '@microsoft/agents-bot-activity'
import { debug } from '../logger'

const logger = debug('agents:userTokenClient')

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
        Accept: 'application/json'
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
  async getUserToken (connectionName: string, channelId: string, userId: string, code?: string) {
    try {
      const params = { connectionName, channelId, userId, code }
      const response = await this.client.get('/api/usertoken/GetToken', { params })
      return response.data
    } catch (error: any) {
      if (error.response?.status !== 404) {
        logger.error(error)
      }
      return null
    }
  }

  /**
   * Signs the user out.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelId The channel ID.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  async signOut (userId: string, connectionName: string, channelId: string) {
    try {
      const params = { userId, connectionName, channelId }
      const response = await this.client.delete('/api/usertoken/SignOut', { params })
      return response.data
    } catch (error: any) {
      logger.error(error)
      return null
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
        ConnectionName: cnxName,
        Conversation: activity.getConversationReference(),
        RelatesTo: activity.RelatesTo,
        MsAppId: appId
      }
      const state = Buffer.from(JSON.stringify(tokenExchangeState)).toString('base64')
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
  async exchangeTokenAsync (userId: string, connectionName: string, channelId: string, tokenExchangeRequest: TokenExchangeRequest) {
    try {
      const params = { userId, connectionName, channelId }
      const response = await this.client.post('/api/usertoken/exchange', tokenExchangeRequest, { params })
      return response.data
    } catch (error: any) {
      logger.error(error)
      return null
    }
  }
}
