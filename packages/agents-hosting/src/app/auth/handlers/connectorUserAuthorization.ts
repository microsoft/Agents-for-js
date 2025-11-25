/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import { AuthorizationHandlerStatus, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationHandlerTokenOptions } from '../types'
import { TurnContext } from '../../../turnContext'
import { TokenResponse } from '../../../oauth'
import jwt, { JwtPayload } from 'jsonwebtoken'

const logger = debug('agents:authorization:connectorUser')

/**
 * Settings for on-behalf-of token acquisition.
 */
export interface ConnectorUserAuthorizationOptionsOBO {
  /**
   * Connection name to use for on-behalf-of token acquisition.
   */
  connection?: string
  /**
   * Scopes to request for on-behalf-of token acquisition.
   */
  scopes?: string[]
}

/**
 * Interface defining a connector user authorization handler configuration.
 */
export interface ConnectorUserAuthorizationOptions {
  /**
   * The type of authorization handler.
   */
  type?: 'connectoruserauthorization'

  /**
   * Settings for on-behalf-of token acquisition.
   * @remarks
   * When using environment variables, these can be set using the following variables:
   * - `${authHandlerId}_obo_connection`
   * - `${authHandlerId}_obo_scopes` (comma-separated values, e.g. `scope1,scope2`)
   */
  obo?: ConnectorUserAuthorizationOptionsOBO

  /**
   * Option to enable SSO when authenticating using Azure Active Directory (AAD). Defaults to true.
   */
  enableSso?: boolean
}

/**
 * Settings for configuring the Connector User authorization handler.
 */
export interface ConnectorUserAuthorizationSettings extends AuthorizationHandlerSettings {}

/**
 * User Authorization handling for Copilot Studio Connector requests.
 */
export class ConnectorUserAuthorization implements AuthorizationHandler {
  private _options: ConnectorUserAuthorizationOptions

  /**
   * Creates an instance of the ConnectorUserAuthorization.
   * @param id The unique identifier for the handler.
   * @param options The options for the handler.
   * @param setting The settings for the authorization handler.
   */
  constructor (public readonly id: string, options: ConnectorUserAuthorizationOptions, private settings: ConnectorUserAuthorizationSettings) {
    if (!this.settings.storage) {
      throw new Error(this.prefix('The \'storage\' option is not available in the app options. Ensure that the app is properly configured.'))
    }

    if (!this.settings.connections) {
      throw new Error(this.prefix('The \'connections\' option is not available in the app options. Ensure that the app is properly configured.'))
    }

    this._options = this.loadOptions(options)
  }

  /**
   * Loads and validates the authorization handler options.
   */
  private loadOptions (settings: ConnectorUserAuthorizationOptions) {
    const result: ConnectorUserAuthorizationOptions = {
      obo: {
        connection: settings.obo?.connection ?? process.env[`${this.id}_obo_connection`],
        scopes: settings.obo?.scopes ?? this.loadScopes(process.env[`${this.id}_obo_scopes`]),
      },
      enableSso: settings.enableSso ?? process.env[`${this.id}_enableSso`] !== 'false' // default value is true
    }
    return result
  }

  /**
   * Sets a handler to be called when a user successfully signs in.
   * @param callback The callback function to be invoked on successful sign-in.
   */
  onSuccess (callback: (context: TurnContext) => Promise<void> | void): void {
    throw new Error('Not implemented')
  }

  /**
   * Sets a handler to be called when a user fails to sign in.
   * @param callback The callback function to be invoked on sign-in failure.
   */
  onFailure (callback: (context: TurnContext, reason?: string) => Promise<void> | void): void {
    throw new Error('Not implemented')
  }

  /**
   * Retrieves the token for the user, optionally using on-behalf-of flow for specified scopes.
   * @param context The turn context.
   * @param options Optional options for token acquisition, including connection and scopes for on-behalf-of flow.
   * @returns The token response containing the token or undefined if not available.
   */
  async token (context: TurnContext, options?: AuthorizationHandlerTokenOptions): Promise<TokenResponse> {
    const tokenResponse = this.createTokenResponse(context)
    const token = tokenResponse?.token

    if (!token?.trim()) {
      return { token: undefined }
    }

    return await this.handleOBO(token, options)
  }

  /**
   * This is a no-op for this handler.
   * @returns True if the signout was successful, false otherwise.
   */
  async signout (): Promise<boolean> {
    // No concept of signout with ConnectorAuth
    return true
  }

  /**
   * Initiates the sign-in process for the handler.
   * @param context The turn context.
   * @returns The status of the sign-in attempt.
   */
  async signin (context: TurnContext): Promise<AuthorizationHandlerStatus> {
    // There is no "sign in" or external token retrieval in this handler.  A single impl is sufficient.
    const tokenResponse = await this.token(context)

    if (tokenResponse.token) {
      return AuthorizationHandlerStatus.APPROVED
    } else {
      return AuthorizationHandlerStatus.REJECTED
    }
  }

  private createTokenResponse (context: TurnContext) {
    if (context.identity) {
      return context.identity
    }
    throw new Error('Unexpected Connector Request Token')
  }

  /**
   * Handles on-behalf-of token acquisition.
   */
  private async handleOBO (token:string, options?: AuthorizationHandlerTokenOptions): Promise<TokenResponse> {
    const oboConnection = options?.connection ?? this._options.obo?.connection
    const oboScopes = options?.scopes && options.scopes.length > 0 ? options.scopes : this._options.obo?.scopes

    if (!oboScopes || oboScopes.length === 0) {
      return { token }
    }

    if (!this.isExchangeable(token)) {
      throw new Error(this.prefix('The current token is not exchangeable for an on-behalf-of flow. Ensure the token audience starts with \'api://\'.'))
    }

    try {
      const provider = oboConnection ? this.settings.connections.getConnection(oboConnection) : this.settings.connections.getDefaultConnection()
      const newToken = await provider.acquireTokenOnBehalfOf(oboScopes, token)
      logger.debug(this.prefix('Successfully acquired on-behalf-of token'), { connection: oboConnection, scopes: oboScopes })
      return { token: newToken }
    } catch (error) {
      logger.error(this.prefix('Failed to exchange on-behalf-of token'), { connection: oboConnection, scopes: oboScopes }, error)
      return { token: undefined }
    }
  }

  /**
   * Checks if a token is exchangeable for an on-behalf-of flow.
   */
  private isExchangeable (token: string | undefined): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }
    const payload = jwt.decode(token) as JwtPayload
    const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
    return audiences.some(aud => typeof aud === 'string' && aud.startsWith('api://'))
  }

  /**
   * Prefixes a message with the handler ID.
   */
  private prefix (message: string) {
    return `[handler:${this.id}] ${message}`
  }

  /**
   * Loads the OAuth scopes from the environment variables.
   */
  private loadScopes (value:string | undefined): string[] {
    return value?.split(',').reduce<string[]>((acc, scope) => {
      const trimmed = scope.trim()
      if (trimmed) {
        acc.push(trimmed)
      }
      return acc
    }, []) ?? []
  }
}
