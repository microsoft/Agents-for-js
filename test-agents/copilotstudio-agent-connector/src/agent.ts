// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import axios from 'axios'
import { startServer } from '@microsoft/agents-hosting-express'
import { AgentApplication, MemoryStorage, RouteSelector, TokenResponse, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { ActivityTypes, RoleTypes } from '@microsoft/agents-activity'

class AgentConnector extends AgentApplication<TurnState> {
  constructor () {
    super({
      startTypingTimer: true,
      storage: new MemoryStorage(),
      authorization: {
        graph: { text: 'Sign in with Microsoft Graph', title: 'Graph Sign In' }
      }
    })

    this.onConversationUpdate('membersAdded', this.welcome)
    this.onActivity(this.mcsMessageSelector, this.mcsMessage)
  }

  welcome = async (context: TurnContext) => {
    await context.sendActivity('Welcome to the MCS Connector sample!')
  }

  mcsMessage = async (ctx: TurnContext, state: TurnState) => {
    const accessToken = await this.authorization.getToken(ctx, 'graph')
    const name = await this.getDisplayName(accessToken)
    await ctx.sendActivity(`Hi ${name}!`)
  }

  mcsMessageSelector: RouteSelector = async (context: TurnContext) => {
    return context.activity.type === ActivityTypes.Message &&
           context.activity.recipient?.role === RoleTypes.ConnectorUser
  }

  private async getDisplayName (tokenResponse: TokenResponse) {
    let displayName = 'Unknown'
    if (tokenResponse.token) {
      const graphInfo = await this.getGraphInfo(tokenResponse.token)
      if (graphInfo && graphInfo.displayName) {
        displayName = graphInfo.displayName
      }
    }
    return displayName
  }

  private async getGraphInfo (token: string) {
    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (response.status === 200) {
        return response.data
      }
    } catch (err) {
      // Handle error response from Graph API
      console.log(`Error getting display name: ${(err as Error).message}`)
    }
    return undefined
  }
}

startServer(new AgentConnector())
