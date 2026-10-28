// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes, type ChannelAccount, ExceptionHelper, RoleTypes } from '@microsoft/agents-activity'
import { Client as GraphClient } from '@microsoft/microsoft-graph-client'
import { AgentApplication, type Authorization, type Connections, ResourceResponse, TurnContext } from '@microsoft/agents-hosting'
import { Client as TeamsClient } from '@microsoft/teams.api'
import { Errors } from './errorHelper'
import type { TeamsActivity } from './teamsActivity'
import { TeamsClientKey } from './teamsApiClientExtensions'
import { createAppGraphClient, createUserGraphClient } from './graphClientFactory'
import { normalizePromptPreviewActivity } from './promptPreviewActivityNormalizer'
import { isRecipientTargeted } from './teamsActivityExtensions'

const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * Turn context wrapper that exposes Teams-specific helpers for a Teams activity turn.
 */
export class TeamsTurnContext extends TurnContext {
  /**
   * Gets the incoming activity with strongly typed Teams channel data.
   *
   * @remarks
   * The returned object is the original turn activity. This getter only narrows
   * its TypeScript type and does not convert or clone the activity.
   */
  override get activity (): TeamsActivity {
    return super.activity as TeamsActivity
  }

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
   * Sends an activity or text as a Teams targeted activity to an explicit recipient.
   *
   * @param activity - The activity or text to send.
   * @param recipient - The recipient account or recipient ID.
   * @returns The resource response for the sent activity, if provided by the adapter.
   */
  async sendTargetedActivity (activity: Activity, recipient: ChannelAccount): Promise<ResourceResponse | undefined>
  async sendTargetedActivity (activity: Activity, recipient: string): Promise<ResourceResponse | undefined>
  async sendTargetedActivity (activity: string, recipient: ChannelAccount): Promise<ResourceResponse | undefined>
  async sendTargetedActivity (activity: string, recipient: string): Promise<ResourceResponse | undefined>
  async sendTargetedActivity (activity: Activity | string, recipient: ChannelAccount | string): Promise<ResourceResponse | undefined> {
    if (activity == null) {
      throw ExceptionHelper.generateException(TypeError, Errors.TargetedActivityParameterRequired, undefined, { parameterName: 'activity' })
    }
    if (recipient == null) {
      throw ExceptionHelper.generateException(TypeError, Errors.TargetedActivityParameterRequired, undefined, { parameterName: 'recipient' })
    }
    if (typeof activity === 'string' && activity.trim().length === 0) {
      throw ExceptionHelper.generateException(TypeError, Errors.ActivityParameterRequired, undefined, { parameterName: 'activity' })
    }
    if (typeof recipient === 'string' && recipient.trim().length === 0) {
      throw ExceptionHelper.generateException(TypeError, Errors.ActivityParameterRequired, undefined, { parameterName: 'recipient' })
    }

    const targetedActivity = typeof activity === 'string'
      ? Activity.fromObject({ type: ActivityTypes.Message, text: activity })
      : Activity.fromObject(activity)
    targetedActivity.conversation ??= this.activity.conversation ? { ...this.activity.conversation } : undefined
    const targetedRecipient = typeof recipient === 'string'
      ? { id: recipient, role: RoleTypes.User }
      : { ...recipient }
    targetedActivity.withTargetedRecipient(targetedRecipient)
    return await this.sendActivity(targetedActivity)
  }

  /**
   * Sends activities after applying Teams prompt-preview metadata when the incoming message is targeted.
   *
   * @param activities - Activities to send.
   * @returns Resource responses for the sent activities.
   */
  override async sendActivities (activities: Activity[]): Promise<ResourceResponse[]> {
    const inboundMessageId = this.activity.type === ActivityTypes.Message &&
      isRecipientTargeted(this.activity) &&
      this.activity.id
      ? this.activity.id
      : undefined

    const preparedActivities = activities.map(activity => {
      const preparedActivity = Activity.fromObject(activity)
      if (inboundMessageId && preparedActivity.type === ActivityTypes.Message) {
        normalizePromptPreviewActivity(preparedActivity, inboundMessageId)
      }
      return preparedActivity
    })

    return await super.sendActivities(preparedActivities)
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
