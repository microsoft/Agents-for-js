/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { Storage, StoreItem } from '../../storage'
import { TurnContext } from '../../turnContext'
import { AgenticAuthorizationOptions, AzureBotAuthorizationOptions } from './handlers'
import { TokenResponse } from '../../oauth'
import { Connections } from '../../auth/connections'

/**
 * Authorization configuration options.
 */
export type AuthorizationOptions = Record<string, (AzureBotAuthorizationOptions & AzureBotAuthorizationOptionsLegacy) | AgenticAuthorizationOptions>

/**
 * Represents the status of a handler registration attempt.
 */
export enum AuthorizationHandlerStatus {
  /** The handler has approved the request - validation passed */
  APPROVED = 'approved',
  /** The handler registration is pending further action */
  PENDING = 'pending',
  /** The handler has rejected the request - validation failed */
  REJECTED = 'rejected',
  /** The handler has ignored the request - no action taken */
  IGNORED = 'ignored',
  /** The handler requires revalidation */
  REVALIDATE = 'revalidate'
}

/**
 * Active handler manager information.
 */
export interface ActiveAuthorizationHandler extends StoreItem {
  /**
   * Unique identifier for the handler.
   */
  readonly id: string
  /**
   * The current activity associated with the handler.
   */
  activity: Activity
}

export interface AuthorizationHandler {
  /**
   * Unique identifier for the handler.
   */
  readonly id: string
  /**
   * Initiates the sign-in process for the handler.
   * @param context The turn context.
   * @param active Optional active handler data.
   * @returns The status of the sign-in attempt.
   */
  signin(context: TurnContext, active?: ActiveAuthorizationHandler): Promise<AuthorizationHandlerStatus>
  /**
   * Initiates the sign-out process for the handler.
   * @param context The turn context.
   * @returns A promise that resolves to a boolean indicating the success of the sign-out attempt.
   */
  signout(context: TurnContext): Promise<boolean>;
  /**
   * Retrieves an access token for the specified scopes.
   * @param context The turn context.
   * @param options Optional token request options.
   * @returns The access token response.
   */
  token(context: TurnContext, options?: AuthorizationHandlerTokenOptions): Promise<TokenResponse>;
  /**
   * Registers a callback to be invoked when the sign-in process is successful.
   * @param callback The callback to invoke on success.
   */
  onSuccess(callback: (context: TurnContext) => Promise<void> | void): void;
  /**
   * Registers a callback to be invoked when the sign-in process fails.
   * @param callback The callback to invoke on failure.
   */
  onFailure(callback: (context: TurnContext, reason?: string) => Promise<void> | void): void;
}

/**
 * Common settings required by authorization handlers.
 */
export interface AuthorizationHandlerSettings {
  /**
   * Storage instance for persisting handler state.
   */
  storage: Storage
  /**
   * Connections instance for managing authentication connections.
   */
  connections: Connections
}

/**
 * Options for token requests in authorization handlers.
 */
export interface AuthorizationHandlerTokenOptions {
  /**
   * Optional name of the connection to use for the token request. Usually used for OBO flows.
   */
  connection?: string
  /**
   * Optional scopes to request in the token. Usually used for OBO flows.
   */
  scopes?: string[]
}

/**
 * Interface defining an authorization handler configuration.
 * @remarks
 * Properties can be configured via environment variables (case-insensitive).
 * Use the format: `AgentApplication__UserAuthorization__handlers__{handlerId}__settings__{propertyName}`
 * where `{handlerId}` is the handler's unique identifier and `{propertyName}` matches the property name.
 *
 * @example
 * ```env
 * # For a handler with id "myAuth":
 * AgentApplication__UserAuthorization__handlers__myAuth__settings__azureBotOAuthConnectionName=MyConnection
 * AgentApplication__UserAuthorization__handlers__myAuth__settings__oboScopes=api://scope1 api://scope2
 * ```
 */
export interface AzureBotAuthorizationOptionsLegacy {
  /**
   * Connection name for the auth provider.
   * @deprecated Use `azureBotOAuthConnectionName` instead.
   * @remarks Env (legacy): `{handlerId}_connectionName`
   */
  name?: string,
  /**
   * Maximum number of attempts for entering the magic code. Defaults to 2.
   * @deprecated Use `invalidSignInRetryMax` instead.
   * @remarks Env (legacy): `{handlerId}_maxAttempts`
   */
  maxAttempts?: number
  /**
   * Messages to display for various authentication scenarios.
   * @deprecated Use `invalidSignInRetryMessage`, `invalidSignInRetryMessageFormat`, and `invalidSignInRetryMaxExceededMessage` instead.
   * @remarks
   * Env (legacy):
   * - `{handlerId}_messages_invalidCode`
   * - `{handlerId}_messages_invalidCodeFormat`
   * - `{handlerId}_messages_maxAttemptsExceeded`
   */
  messages?: AzureBotAuthorizationOptionsMessages
  /**
   * Settings for on-behalf-of token acquisition.
   * @deprecated Use `oboConnectionName` and `oboScopes` instead.
   * @remarks
   * Env (legacy):
   * - `{handlerId}_obo_connection`
   * - `{handlerId}_obo_scopes` (comma or space-separated)
   */
  obo?: AzureBotAuthorizationOptionsOBO
}

/**
 * @deprecated
 * Messages configuration for the AzureBotAuthorization handler.
 */
export interface AzureBotAuthorizationOptionsMessages {
  /**
   * @deprecated Use `invalidSignInRetryMessage` instead.
   * Message displayed when an invalid code is entered.
   * Use `{code}` as a placeholder for the entered code.
   * Defaults to: 'The code entered is invalid. Please sign-in again to continue.'
   */
  invalidCode?: string
  /**
   * @deprecated Use `invalidSignInRetryMessageFormat` instead.
   * Message displayed when the entered code format is invalid.
   * Use `{attemptsLeft}` as a placeholder for the number of attempts left.
   * Defaults to: 'Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**{attemptsLeft} attempt(s) left...**'
   */
  invalidCodeFormat?: string
  /**
   * @deprecated Use `invalidSignInRetryMaxExceededMessage` instead.
   * Message displayed when the maximum number of attempts is exceeded.
   * Use `{maxAttempts}` as a placeholder for the maximum number of attempts.
   * Defaults to: 'You have exceeded the maximum number of sign-in attempts ({maxAttempts}).'
   */
  maxAttemptsExceeded?: string
}

/**
 * @deprecated
 * Settings for on-behalf-of token acquisition.
 */
export interface AzureBotAuthorizationOptionsOBO {
  /**
   * @deprecated Use `oboConnectionName` instead.
   * Connection name to use for on-behalf-of token acquisition.
   */
  connection?: string
  /**
   * @deprecated Use `oboScopes` instead.
   * Scopes to request for on-behalf-of token acquisition.
   */
  scopes?: string[]
}
