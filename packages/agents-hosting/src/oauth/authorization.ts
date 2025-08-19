/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'

import type { AuthorizationHandlers, SignInHandlerState } from './authorization.types'
import type { TokenResponse } from './userTokenClient.types'
import { SignInContext } from './signInContext'
import { SignInStorage } from './signInStorage'
import { OAuthFlow } from './oAuthFlow'
import { UserTokenClient } from './userTokenClient'
import { TurnState } from '../app/turnState'
import { TurnContext } from '../turnContext'
import { Storage } from '../storage'

const logger = debug('agents:authorization')

/**
 * Represents the response from beginning or continuing an OAuth flow.
 * @interface BeginOrContinueFlowResponse
 */
export interface BeginOrContinueFlowResponse extends TokenResponse {
  handler?: SignInHandlerState
}

/**
 * Class responsible for managing authorization and OAuth flows.
 * Handles multiple OAuth providers and manages the complete authentication lifecycle.
 *
 * @remarks
 * The Authorization class provides a centralized way to handle OAuth authentication
 * flows within the agent application. It supports multiple authentication handlers,
 * token exchange, on-behalf-of flows, and provides event handlers for success/failure scenarios.
 *
 * Key features:
 * - Multiple OAuth provider support
 * - Token caching and exchange
 * - On-behalf-of (OBO) token flows
 * - Sign-in success/failure event handling
 * - Automatic configuration from environment variables
 *
 * @example
 * ```typescript
 * const auth = new Authorization(storage, {
 *   'microsoft': {
 *     name: 'Microsoft',
 *     title: 'Sign in with Microsoft',
 *     text: 'Please sign in'
 *   }
 * });
 *
 * auth.onSignInSuccess(async (context, state) => {
 *   await context.sendActivity('Welcome! You are now signed in.');
 * });
 * ```
 *
 */
export class Authorization {
  /**
   * Private handler for successful sign-in events.
   * @private
   */
  private _signInSuccessHandler: Parameters<Authorization['onSignInSuccess']>[0] | null = null

  /**
   * Private handler for failed sign-in events.
   * @private
   */
  private _signInFailureHandler: Parameters<Authorization['onSignInFailure']>[0] | null = null
  /**
   * Storage instance used for managing sign-in state.
   * @private
   */
  private _signInStorage: SignInStorage

  /**
   * Dictionary of configured authentication handlers.
   * @public
   */
  authHandlers: AuthorizationHandlers

  /**
   * Creates a new instance of Authorization.
   *
   * @remarks
   * The constructor initializes all configured auth handlers and sets up OAuth flows.
   * It automatically configures handler properties from environment variables if not provided:
   * - Connection name: {handlerId}_connectionName
   * - Connection title: {handlerId}_connectionTitle
   * - Connection text: {handlerId}_connectionText
   *
   * @example
   * ```typescript
   * const auth = new Authorization(storage, {
   *   'microsoft': {
   *     name: 'Microsoft',
   *     title: 'Sign in with Microsoft'
   *   },
   *   'google': {
   *     // Will use GOOGLE_connectionName from env vars
   *   }
   * });
   * ```
   *
   * @param storage - The storage system to use for state management.
   * @param authHandlers - Configuration for OAuth providers.
   * @throws {Error} If storage is null/undefined or no auth handlers are provided.
   *
   */
  constructor (private storage: Storage, authHandlers: AuthorizationHandlers, userTokenClient: UserTokenClient) {
    if (storage === undefined || storage === null) {
      throw new Error('Storage is required for UserAuthorization')
    }
    if (authHandlers === undefined || Object.keys(authHandlers).length === 0) {
      throw new Error('The authorization does not have any auth handlers')
    }
    this.authHandlers = authHandlers
    for (const ah in this.authHandlers) {
      if (this.authHandlers![ah].name === undefined && process.env[ah + '_connectionName'] === undefined) {
        throw new Error(`AuthHandler name ${ah}_connectionName not set in autorization and not found in env vars.`)
      }
      const currentAuthHandler = this.authHandlers![ah]
      currentAuthHandler.name = currentAuthHandler.name ?? process.env[ah + '_connectionName'] as string
      currentAuthHandler.title = currentAuthHandler.title ?? process.env[ah + '_connectionTitle'] as string
      currentAuthHandler.text = currentAuthHandler.text ?? process.env[ah + '_connectionText'] as string
      currentAuthHandler.cnxPrefix = currentAuthHandler.cnxPrefix ?? process.env[ah + '_cnxPrefix'] as string
      currentAuthHandler.flow = new OAuthFlow(this.storage, currentAuthHandler.name, userTokenClient, currentAuthHandler.title, currentAuthHandler.text)
    }
    logger.info('Authorization handlers configured with', Object.keys(this.authHandlers).length, 'handlers')
    this._signInStorage = new SignInStorage(this.storage, this.authHandlers)
  }

  /**
   * Creates a sign-in context for managing OAuth flows.
   *
   * @param context - The context object for the current turn.
   * @param handlerId - Optional ID of the auth handler to use.
   * @param isStartedFromRoute - Whether the flow is started from an AgentApplication route. Defaults to true.
   * @private
   */
  private createSignInContext (context: TurnContext, handlerId?: string, isStartedFromRoute: boolean = true): SignInContext {
    return new SignInContext(this._signInStorage, this.authHandlers, context, handlerId, isStartedFromRoute)
  }

  /**
   * Gets the token for a specific auth handler.
   *
   * @param context - The context object for the current turn.
   * @param authHandlerId - ID of the auth handler to use.
   * @returns A promise that resolves to the token response from the OAuth provider.
   *
   * @remarks
   * This method retrieves an existing token for the specified auth handler.
   * The token may be cached and will be retrieved from the OAuth provider if needed.
   *
   * @example
   * ```typescript
   * const tokenResponse = await auth.getToken(context, 'microsoft');
   * if (tokenResponse.token) {
   *   console.log('User is authenticated');
   * }
   * ```
   *
   * @public
   */
  public getToken (context: TurnContext, authHandlerId: string): Promise<TokenResponse> {
    const signInContext = this.createSignInContext(context, authHandlerId)
    return signInContext.getUserToken()
  }

  /**
   * Exchanges a token for a new token with different scopes.
   *
   * @param context - The context object for the current turn.
   * @param scopes - Array of scopes to request for the new token.
   * @param authHandlerId - ID of the auth handler to use.
   * @returns A promise that resolves to the exchanged token response.
   *
   * @remarks
   * This method handles token exchange scenarios, particularly for on-behalf-of (OBO) flows.
   * It checks if the current token is exchangeable (e.g., has audience starting with 'api://')
   * and performs the appropriate token exchange using MSAL.
   *
   * @example
   * ```typescript
   * const exchangedToken = await auth.exchangeToken(
   *   context,
   *   ['https://graph.microsoft.com/.default'],
   *   'microsoft'
   * );
   * ```
   *
   * @public
   */
  public exchangeToken (context: TurnContext, scopes: string[], authHandlerId: string): Promise<TokenResponse> {
    const signInContext = this.createSignInContext(context, authHandlerId)
    return signInContext.exchangeToken(scopes)
  }

  /**
   * Begins or continues an OAuth flow.
   *
   * @param context - The context object for the current turn.
   * @param state - The state object for the current turn.
   * @param authHandlerId - ID of the auth handler to use.
   * @param isStartedFromRoute - Whether the flow is started from an AgentApplication route. Defaults to true.
   * @returns A promise that resolves to the token response from the OAuth provider.
   *
   * @remarks
   * This method manages the complete OAuth authentication flow:
   * - If no flow is active, it begins a new OAuth flow and shows the sign-in card
   * - If a flow is active, it continues the flow and processes the authentication response
   * - Handles success/failure callbacks and updates the sign-in state accordingly
   *
   * The method automatically manages the sign-in state and continuation activities,
   * allowing the conversation to resume after successful authentication.
   *
   * @example
   * ```typescript
   * const tokenResponse = await auth.beginOrContinueFlow(context, state, 'microsoft');
   * if (tokenResponse && tokenResponse.token) {
   *   // User is now authenticated
   *   await context.sendActivity('Authentication successful!');
   * }
   * ```
   *
   * @public
   */
  public async beginOrContinueFlow (context: TurnContext, state: TurnState, authHandlerId?: string, isStartedFromRoute: boolean = true) : Promise<BeginOrContinueFlowResponse> {
    const signInContext = this.createSignInContext(context, authHandlerId, isStartedFromRoute)
    signInContext.onSuccess(() => this._signInSuccessHandler?.(context, state, signInContext.handler.id))
    signInContext.onFailure((err) => this._signInFailureHandler?.(context, state, signInContext.handler.id, err))

    const tokenResponse = await signInContext.getToken()
    return { token: tokenResponse?.token, handler: signInContext.handler }
  }

  /**
   * Signs out the current user.
   *
   * @param context - The context object for the current turn.
   * @param state - The state object for the current turn.
   * @param authHandlerId - Optional ID of the auth handler to use for sign out. If not provided, signs out from all handlers.
   * @returns A promise that resolves when sign out is complete.
   *
   * @remarks
   * This method clears the user's token and resets the authentication state.
   * If no specific authHandlerId is provided, it signs out from all configured handlers.
   * This ensures complete cleanup of authentication state across all providers.
   *
   * @example
   * ```typescript
   * // Sign out from specific handler
   * await auth.signOut(context, state, 'microsoft');
   *
   * // Sign out from all handlers
   * await auth.signOut(context, state);
   * ```
   *
   * @public
   */
  async signOut (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<void> {
    if (authHandlerId?.trim()) {
      const signInContext = this.createSignInContext(context, authHandlerId)
      return signInContext?.signOut()
    }

    for (const id in this.authHandlers) {
      const signInContext = this.createSignInContext(context, id)
      await signInContext?.signOut()
    }
  }

  /**
   * Sets a handler to be called when sign-in is successfully completed.
   *
   * @param handler - The handler function to call on successful sign-in.
   *
   * @remarks
   * This method allows you to register a callback that will be invoked whenever
   * a user successfully completes the authentication process. The handler receives
   * the turn context, state, and the ID of the auth handler that was used.
   *
   * @example
   * ```typescript
   * auth.onSignInSuccess(async (context, state, authHandlerId) => {
   *   await context.sendActivity(`Welcome! You signed in using ${authHandlerId}.`);
   *   // Perform any post-authentication setup
   * });
   * ```
   *
   * @public
   */
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, authHandlerId?: string) => Promise<void> | void) {
    this._signInSuccessHandler = handler
  }

  /**
   * Sets a handler to be called when sign-in fails.
   *
   * @param handler - The handler function to call on sign-in failure.
   *
   * @remarks
   * This method allows you to register a callback that will be invoked whenever
   * a user's authentication attempt fails. The handler receives the turn context,
   * state, auth handler ID, and an optional error message describing the failure.
   *
   * Common failure scenarios include:
   * - User cancels the authentication process
   * - Invalid credentials or expired tokens
   * - Network connectivity issues
   * - OAuth provider errors
   *
   * @example
   * ```typescript
   * auth.onSignInFailure(async (context, state, authHandlerId, errorMessage) => {
   *   await context.sendActivity(`Sign-in failed: ${errorMessage || 'Unknown error'}`);
   *   await context.sendActivity('Please try signing in again.');
   * });
   * ```
   *
   * @public
   */
  public onSignInFailure (handler: (context: TurnContext, state: TurnState, authHandlerId?: string, errorMessage?: string) => Promise<void> | void) {
    this._signInFailureHandler = handler
  }
}
