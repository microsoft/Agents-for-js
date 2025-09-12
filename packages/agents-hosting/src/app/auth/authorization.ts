/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AgentApplication } from '../agentApplication'
import { AuthorizationGuardSettings, AuthorizationGuard, AuthorizationGuardContext } from '../guards/authorizationGuard'
import { TurnState } from '../turnState'
import { TurnContext } from '../../turnContext'

/**
 * Loads and manages authorization guards.
 */
export class Authorization<TState extends TurnState> {
  private _initialized = false
  public guards: AuthorizationGuard[] = []

  /**
   * Indicates whether this class has been initialized.
   */
  get initialized () {
    return this._initialized
  }

  /**
   * Creates an instance of the Authorization class.
   * @param app The agent application instance.
   */
  constructor (private app: AgentApplication<TState>) {
    if (!app.options.storage) {
      throw new Error('Storage is required for Authorization. Ensure that a storage provider is configured in the AgentApplication options.')
    }
  }

  /**
   * Initializes authorization guard settings.
   * @param options A record of guard names and their settings.
   * @returns A record of initialized authorization guards.
   *
   * @remarks
   * Environment variables can be used to provide default values:
   * - `{guardName}_connectionName`: Connection name for the guard
   * - `{guardName}_connectionTitle`: Display title for the connection
   * - `{guardName}_connectionText`: Text description for the connection
   * - `{guardName}_cnxPrefix`: Connection prefix
   * - `{guardName}_cancelTrigger`: Trigger to cancel the ongoing auth flow
   * - `{guardName}_scopes`: Comma-separated list of OAuth scopes
   *
   * @example
   * ```typescript
   * // .env file:
   * // myGuard_connectionName=MyOAuthConnection
   * // myGuard_scopes=user.read,mail.read
   *
   * const guards = authorization.initialize({
   *   myGuard: {
   *     // Settings will use .env defaults if not provided
   *   }
   * });
   * ```
   */
  initialize<GuardName extends string>(
    options: Record<GuardName, AuthorizationGuardSettings>
  ): Record<GuardName, AuthorizationGuard> {
    if (!options || Object.keys(options).length === 0) {
      throw new Error('Cannot initialize Authorization with empty options')
    }

    const result = {} as Record<GuardName, AuthorizationGuard>
    for (const [key, value] of Object.entries(options) as [GuardName, AuthorizationGuardSettings][]) {
      const settings: AuthorizationGuardSettings = {
        name: value.name ?? (process.env[`${key}_connectionName`]),
        title: value.title ?? (process.env[`${key}_connectionTitle`]),
        text: value.text ?? (process.env[`${key}_connectionText`]),
        cnxPrefix: value.cnxPrefix ?? (process.env[`${key}_cnxPrefix`]),
        cancelTrigger: value.cancelTrigger ?? process.env[`${key}_cancelTrigger`],
        maxAttempts: value.maxAttempts ?? parseInt(process.env[`${key}_maxAttempts`]!),
        scopes: value.scopes ?? this.loadScopes(process.env[`${key}_scopes`]),
      }
      result[key] = new AuthorizationGuard(key, settings, this.app)
      this.guards.push(result[key])
    }
    this._initialized = true
    return result
  }

  /**
   * Cancels an active authorization guard.
   * @param context The current turn context.
   * @returns An array of canceled authorization guards.
   */
  async cancel (context: TurnContext): Promise<AuthorizationGuard[]> {
    this.isInitialized()

    const result: AuthorizationGuard[] = []
    for (const guard of this.guards) {
      if (await guard.cancel(context)) {
        result.push(guard)
      }
    }

    return result
  }

  /**
   * Logs out of all active authorization guards.
   * @param context The current turn context.
   * @returns An array of authorization guards that were logged out.
   */
  async logout (context: TurnContext): Promise<AuthorizationGuard[]> {
    this.isInitialized()

    const userTokenClient = await this.getUserTokenClient()
    const userId = context.activity.from?.id
    const channelId = context.activity.channelId
    if (!userTokenClient || !userId || !channelId) {
      return []
    }

    const statuses = await userTokenClient.getTokenStatus(userId, channelId)

    const result: AuthorizationGuard[] = []
    for (const status of statuses) {
      if (!status.hasToken) {
        continue
      }

      const guard = this.guards.find(e => e.settings.name === status.connectionName)
      if (guard) {
        await guard.logout(context)
        result.push(guard)
      } else {
        // If there is no guard for the connection, sign out directly
        await userTokenClient.signOut(userId, status.connectionName, channelId)
      }
    }

    return result
  }

  /**
   * Sets a handler to be called when a user successfully signs in.
   * @param callback The callback function to be invoked on successful sign-in.
   */
  onSuccess (callback: (guard: AuthorizationGuard, context: TurnContext, data: AuthorizationGuardContext) => Promise<void> | void): void {
    this.isInitialized()

    for (const guard of this.guards) {
      guard.onSuccess((context, data) => callback(guard, context, data))
    }
  }

  /**
   * Sets a handler to be called when a user fails to sign in.
   * @param callback The callback function to be invoked on sign-in failure.
   */
  onFailure (callback: (guard: AuthorizationGuard, context: TurnContext, reason: string) => Promise<void> | void): void {
    this.isInitialized()

    for (const guard of this.guards) {
      guard.onFailure((context, reason) => callback(guard, context, reason))
    }
  }

  /**
   * Sets a handler to be called when a user cancels the sign-in process.
   * @param callback The callback function to be invoked on sign-in cancellation.
   */
  onCancelled (callback: (guard: AuthorizationGuard, context: TurnContext) => Promise<void> | void): void {
    this.isInitialized()

    for (const guard of this.guards) {
      guard.onCancelled((context) => callback(guard, context))
    }
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

  /**
   * Gets the user token client, ensuring it has a valid auth token.
   */
  private async getUserTokenClient () {
    const userTokenClient = this.app.adapter.userTokenClient
    if (!userTokenClient?.client.defaults.headers.common.Authorization) {
      try {
        const accessToken = await this.app.adapter.authProvider.getAccessToken(this.app.adapter.authConfig, 'https://api.botframework.com')
        userTokenClient?.updateAuthToken(accessToken)
      } catch (error) {
        // Log the error and return null to indicate failure
        console.error('Failed to get or update auth token:', error)
        return null
      }
    }
    return userTokenClient
  }

  private isInitialized () {
    if (!this._initialized) {
      throw new Error('Ensure to \'initialize\' Authorization class before using it.')
    }
  }
}
