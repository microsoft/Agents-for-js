/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity'
import { TurnContext } from '../../../turnContext'
import { AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationHandlerStatus, AuthorizationHandlerTokenOptions } from '../types'
import { TokenResponse } from '../../../oauth'
import { AuthProvider } from '../../../auth'

const logger = debug('agents:authorization:agentic')

/**
 * Options for configuring the Agentic authorization handler.
 * @remarks
 * Properties can be configured via environment variables (case-insensitive).
 * Use the format: `AgentApplication__UserAuthorization__handlers__{handlerId}__settings__{propertyName}`
 * where `{handlerId}` is the handler's unique identifier and `{propertyName}` matches the property name.
 *
 * @example
 * ```env
 * # For a handler with id "myAuth":
 * AgentApplication__UserAuthorization__handlers__myAuth__settings__type=AgenticUserAuthorization
 * AgentApplication__UserAuthorization__handlers__myAuth__settings__scopes=api://scope1 api://scope2
 * ```
 */
export interface AgenticAuthorizationOptions {
  /**
   * The type of authorization handler.
   */
  type: 'AgenticUserAuthorization' | 'agentic'
  /**
   * The scopes required for the authorization.
   * @remarks When set via environment variable, use comma or space-separated values (e.g. `scope1,scope2` or `scope1 scope2`).
   */
  scopes?: string[]
  /**
   * An alternative connection name to use for the authorization process.
   */
  altBlueprintConnectionName?: string
}

/**
 * Settings for configuring the Agentic authorization handler.
 */
export interface AgenticAuthorizationSettings extends AuthorizationHandlerSettings {}

/**
 * Authorization handler for Agentic authentication.
 */
export class AgenticAuthorization implements AuthorizationHandler {
  private _onSuccess?: Parameters<AuthorizationHandler['onSuccess']>[0]
  private _onFailure?: Parameters<AuthorizationHandler['onFailure']>[0]

  /**
   * Creates an instance of the AgenticAuthorization class.
   * @param id The unique identifier for the authorization handler.
   * @param options The options for configuring the authorization handler (must be fully resolved).
   * @param settings The settings for the authorization handler.
   */
  constructor (public readonly id: string, private options: AgenticAuthorizationOptions, private settings: AgenticAuthorizationSettings) {
    if (!this.settings.connections) {
      throw new Error(this.prefix('The \'connections\' option is not available in the app options. Ensure that the app is properly configured.'))
    }

    if (!options.scopes || options.scopes.length === 0) {
      throw new Error(this.prefix('At least one scope must be specified for the Agentic authorization handler.'))
    }
  }

  /**
   * @inheritdoc
   */
  signin (): Promise<AuthorizationHandlerStatus> {
    return Promise.resolve(AuthorizationHandlerStatus.IGNORED)
  }

  /**
   * @inheritdoc
   */
  signout (): Promise<boolean> {
    return Promise.resolve(false)
  }

  /**
   * @inheritdoc
   */
  async token (context: TurnContext, options?: AuthorizationHandlerTokenOptions): Promise<TokenResponse> {
    try {
      const scopes = options?.scopes || this.options.scopes!

      const tokenResponse = this.getContext(context, scopes)
      if (tokenResponse.token) {
        logger.debug(this.prefix('Using cached Agentic user token'))
        return tokenResponse
      }

      let connection: AuthProvider

      if (this.options.altBlueprintConnectionName?.trim()) {
        connection = this.settings.connections.getConnection(this.options.altBlueprintConnectionName)
      } else {
        connection = this.settings.connections.getTokenProvider(context.identity, context.activity.serviceUrl ?? '')
      }

      const token = await connection.getAgenticUserToken(
        context.activity.getAgenticTenantId() ?? '',
        context.activity.getAgenticInstanceId() ?? '',
        context.activity.getAgenticUser() ?? '',
        scopes
      )

      this.setContext(context, scopes, { token })
      this._onSuccess?.(context)
      return { token }
    } catch (error) {
      const reason = 'Error retrieving Agentic user token'
      logger.error(this.prefix(reason), error)
      this._onFailure?.(context, `${reason}: ${(error as Error).message}`)
      return { token: undefined }
    }
  }

  /**
   * @inheritdoc
   */
  onSuccess (callback: (context: TurnContext) => void): void {
    this._onSuccess = callback
  }

  /**
   * @inheritdoc
   */
  onFailure (callback: (context: TurnContext, reason?: string) => void): void {
    this._onFailure = callback
  }

  /**
   * Prefixes a message with the handler ID.
   */
  private prefix (message: string) {
    return `[handler:${this.id}] ${message}`
  }

  private _key = `${AgenticAuthorization.name}/${this.id}`

  /**
   * Sets the authorization context in the turn state.
   * @param context The turn context in which to set the authorization data.
   * @param scopes The OAuth scopes associated with the authorization context.
   * @param data The token response to store in the turn state.
   */
  private setContext (context: TurnContext, scopes: string[], data: TokenResponse) {
    return context.turnState.set(`${this._key}:${scopes.join(';')}`, () => data)
  }

  /**
   * Gets the authorization context from the turn state.
   * @param scopes The OAuth scopes for which the context is being retrieved.
   */
  private getContext (context: TurnContext, scopes: string[]): TokenResponse {
    const result = context.turnState.get(`${this._key}:${scopes.join(';')}`)
    return result?.() ?? { token: undefined }
  }
}
