// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import { Client as GraphClient } from '@microsoft/microsoft-graph-client'
import { AgentApplication, type Authorization, type Connections, ResourceResponse, TurnContext } from '@microsoft/agents-hosting'
import { Client as TeamsClient } from '@microsoft/teams.api'
import { Errors } from './errorHelper'
import { TeamsClientKey } from './teamsApiClientExtensions'
import { createAppGraphClient, createUserGraphClient } from './graphClientFactory'

const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * Turn context wrapper that exposes Teams-specific helpers for a Teams activity turn.
 */
export class TeamsTurnContext extends TurnContext {
  /**
   * Gets the Teams API client for the current turn.
   *
   * @returns The Teams API client configured for the activity's service URL.
   * @throws If the Teams API client is not available in turn state.
   */
  get client (): TeamsClient {
    const teamsClient = this.turnState.get<TeamsClient>(TeamsClientKey)
    if (!teamsClient) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsApiClientNotAvailable)
    }
    return teamsClient
  }

  /**
   * Sends a cloned copy of an activity as a Teams targeted activity.
   *
   * @param activity - The activity to send to the targeted recipient.
   * @returns The resource response for the sent activity, if provided by the adapter.
   */
  async sendTargetedActivity (activity: Activity): Promise<ResourceResponse | undefined> {
    const targetedActivity = Activity.fromObject(activity)
    targetedActivity.makeTargetedActivity()
    return await this.sendActivity(targetedActivity)
  }

  /**
   * Sends cloned copies of activities as Teams targeted activities.
   *
   * @param activities - The activities to send to targeted recipients.
   * @returns Resource responses for the sent activities.
   */
  async sendTargetedActivities (activities: Activity[]): Promise<ResourceResponse[]> {
    const targetedActivities = activities.map((activity) => {
      const targetedActivity = Activity.fromObject(activity)
      targetedActivity.makeTargetedActivity()
      return targetedActivity
    })
    return await this.sendActivities(targetedActivities)
  }

  /**
   * Creates a Microsoft Graph client authenticated with a delegated token for the current user.
   *
   * @param handlerName - Optional authorization handler name. Required when multiple handlers are configured.
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with delegated permissions.
   */
  getGraphClient (handlerName?: string, graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    return createUserGraphClient(this.getUserAuthorization(), this, handlerName, graphBaseUrl)
  }

  /**
   * Creates a Microsoft Graph client authenticated with an app-only token from the current turn's connection.
   *
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with application permissions.
   */
  getAppGraphClient (graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    const tokenProvider = this.getConnections().getTokenProviderFromActivity(this.identity, this.activity)
    return createAppGraphClient(tokenProvider, graphBaseUrl)
  }

  /**
   * Creates a Microsoft Graph client authenticated with an app-only token from a named connection.
   *
   * @param connectionName - The configured token connection name.
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with application permissions.
   */
  getAppGraphClientForConnection (connectionName: string, graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    if (!connectionName) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'connectionName' })
    }

    return createAppGraphClient(this.getConnections().getConnection(connectionName), graphBaseUrl)
  }

  private getUserAuthorization (): Authorization {
    const authorization = this.turnState.get<Authorization>(AgentApplication.UserAuthorizationKey)
    if (!authorization) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphUserAuthorizationNotConfigured)
    }

    return authorization
  }

  private getConnections (): Connections {
    const connections = this.turnState.get<Connections>(AgentApplication.ConnectionsKey)
    if (!connections) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphConnectionsNotConfigured)
    }

    return connections
  }
}
