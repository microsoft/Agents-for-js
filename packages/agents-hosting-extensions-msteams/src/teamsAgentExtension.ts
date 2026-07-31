// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Client as GraphClient } from '@microsoft/microsoft-graph-client'
import { AgentApplication, AgentExtension, type Connections, TurnContext, TurnState } from '@microsoft/agents-hosting'
import { Client as TeamsClient } from '@microsoft/teams.api'
import { parseTeamsChannelData } from './activity-extensions'
import { TeamsConfig } from './config/config'
import { FileConsent } from './fileConsents/fileConsent'
import { Meeting } from './meetings/meeting'
import { Message } from './messages/message'
import { MessageExtension } from './messageExtensions/messageExtension'
import { TaskModule } from './taskModules/taskModule'
import { TeamsChannel } from './channels/teamsChannel'
import { TeamsTeam } from './teams/teamsTeam'
import { setTeamsApiClient } from './teamsApiClientExtensions'
import { applyTeamsHeaderPropagation } from './teamsHeaderPropagation'
import { TeamsTurnContext } from './teamsTurnContext'
import { createAppGraphClient, createUserGraphClient } from './graphClientFactory'
import { Errors } from './errorHelper'

const DEFAULT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0'

/**
 * Adds Microsoft Teams-specific routing, context helpers, and API clients to an agent application.
 *
 * Register an instance with `AgentApplication.registerExtension` to configure handlers for Teams
 * events, message extensions, task modules, file consent flows, and related Teams capabilities.
 *
 * @typeParam TState - The turn state type used by the agent application.
 */
export class TeamsAgentExtension<TState extends TurnState = TurnState> extends AgentExtension<TState> {
  private _app: AgentApplication<TState>
  private _meetings: Meeting<TState>
  private _messageExtensions: MessageExtension<TState>
  private _taskModules: TaskModule<TState>
  private _channels: TeamsChannel<TState>
  private _teams: TeamsTeam<TState>
  private _messages: Message<TState>
  private _fileConsent: FileConsent<TState>
  private _config: TeamsConfig<TState>

  /**
   * Creates a new Teams extension for the provided agent application.
   *
   * The extension configures Teams header propagation and prepares a Teams API client for each
   * incoming Teams turn.
   *
   * @param app - The agent application to extend with Teams capabilities.
   */
  constructor (app: AgentApplication<TState>) {
    super('msteams')
    this._app = app
    this._meetings = new Meeting(app)
    this._messageExtensions = new MessageExtension(app)
    this._taskModules = new TaskModule(app)
    this._channels = new TeamsChannel(app)
    this._teams = new TeamsTeam(app)
    this._messages = new Message(app)
    this._fileConsent = new FileConsent(app)
    this._config = new TeamsConfig(app)

    const headerPropagation = this._app.options.headerPropagation
    this._app.options.headerPropagation = (headers) => {
      headerPropagation?.(headers)
      applyTeamsHeaderPropagation(headers)
    }

    this._app.onTurn('beforeTurn', async (context) => {
      if (context.activity.channelId === this.channelId) {
        setTeamsApiClient(context, this.channelId)
        try {
          context.activity.channelData = parseTeamsChannelData(context.activity.channelData)
        } catch {
          // ignore parse errors for non-Teams channel data
        }
      }
      return true
    })
  }

  /**
   * Gets the route registration helper for Teams meeting events.
   */
  public get meetings (): Meeting<TState> {
    return this._meetings
  }

  /**
   * Gets the route registration helper for Teams message extension activities.
   */
  public get messageExtensions (): MessageExtension<TState> {
    return this._messageExtensions
  }

  /**
   * Gets the route registration helper for Teams task module invoke activities.
   */
  public get taskModules (): TaskModule<TState> {
    return this._taskModules
  }

  /**
   * Gets the route registration helper for Teams channel events.
   */
  public get channels (): TeamsChannel<TState> {
    return this._channels
  }

  /**
   * Gets the route registration helper for Teams team events.
   */
  public get teams (): TeamsTeam<TState> {
    return this._teams
  }

  /**
   * Gets the route registration helper for Teams message lifecycle events.
   */
  public get messages (): Message<TState> {
    return this._messages
  }

  /**
   * Gets the route registration helper for Teams file consent card actions.
   */
  public get fileConsent (): FileConsent<TState> {
    return this._fileConsent
  }

  /**
   * Gets the route registration helper for Teams app configuration invokes.
   */
  public get config (): TeamsConfig<TState> {
    return this._config
  }

  /**
   * Gets the Teams API client associated with the current turn.
   *
   * @param context - The turn context for the current Teams activity.
   * @returns The Teams API client stored on the turn.
   * @throws If the current turn has not been initialized with a Teams API client.
   */
  public getTeamsClient (context: TurnContext): TeamsClient {
    return new TeamsTurnContext(context).client
  }

  /**
   * Creates a Microsoft Graph client that obtains access tokens through the agent authorization system.
   *
   * @param context - The turn context used to acquire the user token.
   * @param handlerName - Optional authorization handler name. Required when multiple handlers are configured.
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with the resolved authentication provider.
   */
  public getGraphClient (context: TurnContext, handlerName?: string, graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    if (!context) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'context' })
    }

    return createUserGraphClient(this._app.authorization, context, handlerName, graphBaseUrl)
  }

  /**
   * Creates a Microsoft Graph client that obtains an app-only token from the connection resolved for the current turn.
   *
   * @param context - The turn context used to resolve the token connection.
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with application permissions.
   */
  public getAppGraphClient (context: TurnContext, graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    if (!context) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'context' })
    }

    const tokenProvider = this.getConnections().getTokenProviderFromActivity(context.identity, context.activity)
    return createAppGraphClient(tokenProvider, graphBaseUrl)
  }

  /**
   * Creates a Microsoft Graph client that obtains an app-only token from a named connection.
   *
   * @param connectionName - The configured token connection name.
   * @param graphBaseUrl - Optional Graph base URL. Defaults to Microsoft Graph v1.0.
   * @returns A Microsoft Graph client configured with application permissions.
   */
  public getAppGraphClientForConnection (connectionName: string, graphBaseUrl: string = DEFAULT_GRAPH_BASE_URL): GraphClient {
    if (!connectionName) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphParameterRequired, undefined, { parameterName: 'connectionName' })
    }

    return createAppGraphClient(this.getConnections().getConnection(connectionName), graphBaseUrl)
  }

  private getConnections (): Connections {
    const connections = this._app.options.connections ?? this._app.adapter.connectionManager
    if (!connections) {
      throw ExceptionHelper.generateException(Error, Errors.TeamsGraphConnectionsNotConfigured)
    }

    return connections
  }
}
