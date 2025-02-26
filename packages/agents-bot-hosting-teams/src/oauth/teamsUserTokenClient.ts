// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { debug, UserTokenClient } from '@microsoft/agents-bot-hosting'
import { TokenExchangeRequest } from './tokenExchangeRequest'

const logger = debug('agents:teamsUserTokenClient')

export class TeamsUserTokenClient extends UserTokenClient {
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
