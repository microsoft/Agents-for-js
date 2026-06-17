// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { HttpClient, HttpError } from '../httpClient'
import { Activity, ConversationReference } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { normalizeTokenExchangeState } from '../activityWireCompat'
import { AadResourceUrls, SignInResource, TokenExchangeRequest, TokenOrSinginResourceResponse, TokenResponse, TokenStatus } from './userTokenClient.types'
import { applyUserAgentHeader, getProductInfo } from '../getProductInfo'
import { AuthProvider } from '../auth'
import { HeaderPropagation, HeaderPropagationCollection } from '../headerPropagation'
import { getTokenServiceEndpoint } from './customUserTokenAPI'
import { trace } from '@microsoft/agents-telemetry'
import { UserTokenClientTraceDefinitions } from '../observability'

const logger = debug('agents:user-token-client')

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

/**
 * Client for managing user tokens.
 */
export class UserTokenClient {
  client: HttpClient
  private msAppId: string = ''
  /**
   * Creates a new instance of UserTokenClient.
   * @param msAppId The Microsoft application ID.
   */
  constructor (msAppId: string)
  /**
   * Creates a new instance of UserTokenClient.
   * @param httpClient The HttpClient instance.
   */
  constructor (httpClient: HttpClient)

  constructor (param: string | HttpClient) {
    if (typeof param === 'string') {
      const baseURL = getTokenServiceEndpoint()
      this.client = new HttpClient({
        baseURL,
        headers: {
          Accept: 'application/json',
          'User-Agent': getProductInfo(),
        }
      })
    } else {
      this.client = param
    }
  }

  /**
   * Creates a new instance of UserTokenClient with authentication.
   * @param baseURL - The base URL for the API.
   * @param authConfig - The authentication configuration.
   * @param authProvider - The authentication provider.
   * @param scope - The scope for the authentication token.
   * @param headers - Optional headers to propagate in the request.
   * @returns A new instance of ConnectorClient.
   */
  static async createClientWithScope (
    baseURL: string,
    authProvider: AuthProvider,
    scope: string,
    headers?: HeaderPropagationCollection
  ): Promise<UserTokenClient> {
    const headerPropagation = headers ?? new HeaderPropagation({})
    applyUserAgentHeader(headerPropagation)
    headerPropagation.override({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    })

    const clientHeaders: Record<string, string> = { ...headerPropagation.outgoing }
    const token = await authProvider?.getAccessToken(scope)
    if (token && token.length > 1) {
      clientHeaders.Authorization = `Bearer ${token}`
    }

    const httpClient = new HttpClient({
      baseURL,
      headers: clientHeaders,
    })

    return new UserTokenClient(httpClient)
  }

  /**
   * Gets the user token.
   * @param connectionName The connection name.
   * @param channelIdComposite The channel ID.
   * @param userId The user ID.
   * @param code The optional code.
   * @returns A promise that resolves to the user token.
   */
  async getUserToken (connectionName: string, channelIdComposite: string, userId: string, code?: string) : Promise<TokenResponse> {
    return trace(UserTokenClientTraceDefinitions.getUserToken, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const params = { connectionName, channelId, userId, code }
      try {
        const response = await this.executeRequest('get', '/api/usertoken/GetToken', undefined, { params })
        record({ connectionName, channelId, userId, httpStatusCode: response.status?.toString() })

        if (response?.data) {
          return response.data as TokenResponse
        }
        return { token: undefined }
      } catch (error: any) {
        if (error instanceof HttpError && error.status === 404) {
          record({ connectionName, channelId, userId, httpStatusCode: '404' })
          return { token: undefined }
        }
        throw error
      }
    })
  }

  /**
   * Signs the user out.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelIdComposite The channel ID.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  async signOut (userId: string, connectionName: string, channelIdComposite: string) : Promise<void> {
    return trace(UserTokenClientTraceDefinitions.signOut, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const params = { userId, connectionName, channelId }
      const response = await this.executeRequest('delete', '/api/usertoken/SignOut', undefined, { params })
      record({ userId, connectionName, channelId, httpStatusCode: response.status?.toString() })
      if (response.status !== 200) {
        throw new Error('Failed to sign out')
      }
    })
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
    return trace(UserTokenClientTraceDefinitions.getSignInResource, async ({ record }) => {
      const tokenExchangeState = {
        connectionName,
        conversation,
        relatesTo,
        msAppId
      }
      const tokenExchangeStateNormalized = normalizeTokenExchangeState(tokenExchangeState)
      const state = Buffer.from(JSON.stringify(tokenExchangeStateNormalized)).toString('base64')
      const params = { state }
      const response = await this.executeRequest('get', '/api/botsignin/GetSignInResource', undefined, { params })
      record({ connectionName, httpStatusCode: response.status?.toString() })
      return response.data as SignInResource
    })
  }

  /**
   * Exchanges the token.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelIdComposite The channel ID.
   * @param tokenExchangeRequest The token exchange request.
   * @returns A promise that resolves to the exchanged token.
   */
  async exchangeTokenAsync (userId: string, connectionName: string, channelIdComposite: string, tokenExchangeRequest: TokenExchangeRequest) : Promise<TokenResponse> {
    return trace(UserTokenClientTraceDefinitions.exchangeToken, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const params = { userId, connectionName, channelId }
      const response = await this.executeRequest('post', '/api/usertoken/exchange', tokenExchangeRequest, { params })
      record({ userId, connectionName, channelId, httpStatusCode: response.status?.toString() })
      if (response?.data) {
        return response.data as TokenResponse
      } else {
        return { token: undefined }
      }
    })
  }

  /**
   * Gets the token or sign-in resource.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelIdComposite The channel ID.
   * @param conversation The conversation reference.
   * @param relatesTo The related conversation reference.
   * @param code The code.
   * @param finalRedirect The final redirect URL.
   * @param fwdUrl The forward URL.
   * @returns A promise that resolves to the token or sign-in resource response.
   */
  async getTokenOrSignInResource (userId: string, connectionName: string, channelIdComposite: string, conversation: ConversationReference, relatesTo: ConversationReference, code: string, finalRedirect: string = '', fwdUrl: string = '') : Promise<TokenOrSinginResourceResponse> {
    return trace(UserTokenClientTraceDefinitions.getTokenOrSignInResource, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const state = Buffer.from(JSON.stringify({ conversation, relatesTo, connectionName, msAppId: this.msAppId })).toString('base64')
      const params = { userId, connectionName, channelId, state, code, finalRedirect, fwdUrl }
      const response = await this.executeRequest('get', '/api/usertoken/GetTokenOrSignInResource', undefined, { params })
      record({ userId, connectionName, channelId, httpStatusCode: response?.status?.toString() })
      return response.data as TokenOrSinginResourceResponse
    })
  }

  /**
   * Gets the token status.
   * @param userId The user ID.
   * @param channelIdComposite The channel ID.
   * @param include The optional include parameter.
   * @returns A promise that resolves to the token status.
   */
  async getTokenStatus (userId: string, channelIdComposite: string, include: string = null!): Promise<TokenStatus[]> {
    return trace(UserTokenClientTraceDefinitions.getTokenStatus, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const params = { userId, channelId, include }
      const response = await this.executeRequest('get', '/api/usertoken/GetTokenStatus', undefined, { params })
      record({ userId, channelId, httpStatusCode: response.status?.toString() })
      return response.data as TokenStatus[]
    })
  }

  /**
   * Gets the AAD tokens.
   * @param userId The user ID.
   * @param connectionName The connection name.
   * @param channelIdComposite The channel ID.
   * @param resourceUrls The resource URLs.
   * @returns A promise that resolves to the AAD tokens.
   */
  async getAadTokens (userId: string, connectionName: string, channelIdComposite: string, resourceUrls: AadResourceUrls) : Promise<Record<string, TokenResponse>> {
    return trace(UserTokenClientTraceDefinitions.getAadTokens, async ({ record }) => {
      const [channelId] = Activity.parseChannelId(channelIdComposite)
      const params = { userId, connectionName, channelId }
      const response = await this.executeRequest('post', '/api/usertoken/GetAadTokens', resourceUrls, { params })
      record({ userId, connectionName, channelId, httpStatusCode: response.status?.toString() })
      return response.data as Record<string, TokenResponse>
    })
  }

  public updateAuthToken (token: string): void {
    this.client.setHeader('Authorization', `Bearer ${token}`)
  }

  private async executeRequest<T = unknown> (method: string, url: string, data?: unknown, options?: { params?: Record<string, string | undefined> }): Promise<{ data: T, status: number, statusText: string }> {
    const { params } = options ?? {}
    const { Authorization, authorization, ...headersToLog } = this.client.defaultHeaders
    logger.debug('Request: ', {
      host: this.client.baseURL,
      url,
      data,
      method,
      params,
      headers: headersToLog
    })

    try {
      const response = await this.client.request<T>({ method, url, data, params })
      const { token: _token, ...redactedData } = (response.config?.data ?? {}) as Record<string, unknown>
      logger.debug('Response: ', {
        status: response.status,
        statusText: response.statusText,
        host: this.client.baseURL,
        url: response.config?.url,
        data: redactedData,
        method: response.config?.method,
      })
      return response
    } catch (error: any) {
      if (error instanceof HttpError) {
        const message = formatHttpErrorMessage(error)
        const errorDetails = {
          host: this.client.baseURL,
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          message,
          headers: error.response?.headers,
          stack: error.stack,
        }
        logger.debug('Response error: ', errorDetails)

        Object.assign(error, {
          host: this.client.baseURL,
          url: error.config.url,
          method: error.config.method,
          data: error.config.data,
          headers: error.response?.headers,
          message,
        })
      }
      throw error
    }
  }
}
