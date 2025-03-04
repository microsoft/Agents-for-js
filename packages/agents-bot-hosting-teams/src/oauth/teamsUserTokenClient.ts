// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { debug, UserTokenClient, TokenExchangeRequest } from '@microsoft/agents-bot-hosting'

const logger = debug('agents:teamsUserTokenClient')

/**
 * TeamsUserTokenClient is responsible for handling token exchange operations for Teams users.
 */
export class TeamsUserTokenClient extends UserTokenClient {
  /**
   * Exchanges a token for a user.
   * @param userId The ID of the user.
   * @param connectionName The name of the connection.
   * @param channelId The ID of the channel.
   * @param tokenExchangeRequest The token exchange request.
   * @returns A promise that resolves to the exchanged token or null if an error occurs.
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
