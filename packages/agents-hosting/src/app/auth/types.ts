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
 * Handler options type for authorization handlers.
 */
export type AuthorizationHandlerOptions = AzureBotAuthorizationOptions | AgenticAuthorizationOptions

/**
 * Configuration for an individual authorization handler.
 */
export interface AuthorizationHandlerConfig {
  /**
   * The settings for the authorization handler.
   */
  settings: AuthorizationHandlerOptions
}

/**
 * A record of authorization handler configurations keyed by their unique identifiers.
 */
export type AuthorizationHandlers = Record<string, AuthorizationHandlerConfig>

/**
 * Function type for selecting whether to auto sign-in.
 */
export type AutoSignInSelector = (context: TurnContext) => Promise<boolean> | boolean

/**
 * User authorization configuration options.
 *
 * @remarks
 * Properties can be configured via environment variables.
 * Use the format:
 * `AgentApplication__UserAuthorization__{propertyName}`
 *
 * @example
 * ```env
 * # For all handlers
 *
 * AGENTAPPLICATION__USERAUTHORIZATION__DEFAULTHANDLERNAME=graph
 * AGENTAPPLICATION__USERAUTHORIZATION__AUTOSIGNIN=true
 * ```
 *
 * @example
 * ```typescript
 * userAuthorization: {
 *   defaultHandlerName: 'graph',
 *   autoSignIn: () => true,
 *   handlers: {
 *     graph: {
 *       settings: { text: 'Sign in with Microsoft Graph', title: 'Graph Sign In' }
 *     },
 *     github: {
 *       settings: { text: 'Sign in with GitHub', title: 'GitHub Sign In' }
 *     },
 *   }
 * }
 * ```
 */
export interface UserAuthorizationOptions {
  /**
   * The name of the default authorization handler to use when no specific handler is specified.
   * @remarks If not provided, the first handler in the list will be used as the default.
   */
  defaultHandlerName?: string
  /**
   * Indicates whether to automatically sign in users when they interact with the application.
   * @remarks Auto sign-in is enabled by default and remains enabled unless explicitly disabled (for example, by setting the corresponding configuration or environment variable to 'false').
   */
  autoSignIn?: AutoSignInSelector
  /**
   * A record of authorization handlers keyed by their unique identifiers.
   */
  handlers: AuthorizationHandlers
}

/**
 * Authorization configuration options.
 * @deprecated Use {@link UserAuthorizationOptions} with the `userAuthorization` property instead.
 * This flat structure will be removed in a future version.
 *
 * @example
 * ```typescript
 * // Deprecated:
 * authorization: {
 *   graph: { text: '...', title: '...' },
 *   github: { text: '...', title: '...' },
 * }
 *
 * // Use instead:
 * userAuthorization: {
 *   handlers: {
 *     graph: {
 *       settings: { text: '...', title: '...' }
 *     },
 *     github: {
 *       settings: { text: '...', title: '...' }
 *     },
 *   }
 * }
 * ```
 */
export type AuthorizationOptions = Record<string, AuthorizationHandlerOptions>

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
