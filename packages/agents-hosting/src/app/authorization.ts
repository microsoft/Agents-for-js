/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../turnContext'
import { debug } from '../logger'
import { TurnState } from './turnState'
import { Storage } from '../storage'
import { OAuthFlow, TokenResponse } from '../oauth'
import { AuthConfiguration, MsalTokenProvider } from '../auth'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { Activity } from '@microsoft/agents-activity'

const logger = debug('agents:authorization')

/**
 * Interface representing the state of a sign-in process.
 * @interface SingInState
 */
export interface SingInState {
  /** Optional activity to continue with after sign-in completion */
  continuationActivity?: Activity,
  /** Identifier of the auth handler being used */
  handlerId?: string,
  /** Whether the sign-in process has been completed */
  completed?: boolean
}

/**
 * Interface defining an authorization handler for OAuth flows
 * @interface AuthHandler
 */
export interface AuthHandler {
  /** Connection name for the auth provider */
  name?: string,
  /** The OAuth flow implementation */
  flow?: OAuthFlow,
  /** Title to display on auth cards/UI */
  title?: string,
  /** Text to display on auth cards/UI */
  text?: string,
}

/**
 * Options for configuring user authorization.
 * Contains settings to configure OAuth connections.
 * @interface AuthorizationHandlers
 */
export interface AuthorizationHandlers extends Record<string, AuthHandler> {}

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
 * Example usage:
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
 */
export class Authorization {
  /**
   * Dictionary of configured authentication handlers.
   * @public
   */
  _authHandlers: AuthorizationHandlers

  /**
   * Creates a new instance of Authorization.
   *
   * @param storage - The storage system to use for state management.
   * @param authHandlers - Configuration for OAuth providers.
   * @throws Error if storage is null/undefined or no auth handlers are provided.
   *
   * @remarks
   * The constructor initializes all configured auth handlers and sets up OAuth flows.
   * It automatically configures handler properties from environment variables if not provided:
   * - Connection name: {handlerId}_connectionName
   * - Connection title: {handlerId}_connectionTitle
   * - Connection text: {handlerId}_connectionText
   *
   * Example usage:
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
   */
  constructor (private storage: Storage, authHandlers: AuthorizationHandlers) {
    if (storage === undefined || storage === null) {
      throw new Error('Storage is required for UserAuthorization')
    }
    if (authHandlers === undefined || Object.keys(authHandlers).length === 0) {
      throw new Error('The authorization does not have any auth handlers')
    }
    this._authHandlers = authHandlers
    for (const ah in this._authHandlers) {
      if (this._authHandlers![ah].name === undefined && process.env[ah + '_connectionName'] === undefined) {
        throw new Error(`AuthHandler name ${ah}_connectionName not set in autorization and not found in env vars.`)
      }
      const currentAuthHandler = this._authHandlers![ah]
      currentAuthHandler.name = currentAuthHandler.name ?? process.env[ah + '_connectionName'] as string
      currentAuthHandler.title = currentAuthHandler.title ?? process.env[ah + '_connectionTitle'] as string
      currentAuthHandler.text = currentAuthHandler.text ?? process.env[ah + '_connectionText'] as string
      currentAuthHandler.flow = new OAuthFlow(this.storage, currentAuthHandler.name, null!, currentAuthHandler.title, currentAuthHandler.text)
    }
    logger.info('Authorization handlers configured with', Object.keys(this._authHandlers).length, 'handlers')
  }

  /**
   * Gets the token for a specific auth handler.
   *
   * @param context - The context object for the current turn.
   * @param authHandlerId - Optional ID of the auth handler to use, defaults to first handler.
   * @returns A promise that resolves to the token response from the OAuth provider.
   *
   * @remarks
   * This method retrieves an existing token for the specified auth handler.
   * If no authHandlerId is provided, it uses the first configured handler.
   * The token may be cached and will be retrieved from the OAuth provider if needed.
   *
   * Example usage:
   * ```typescript
   * const tokenResponse = await auth.getToken(context, 'microsoft');
   * if (tokenResponse.token) {
   *   console.log('User is authenticated');
   * }
   * ```
   */
  public async getToken (context: TurnContext, authHandlerId: string): Promise<TokenResponse> {
    logger.info('getToken from user token service for authHandlerId:', authHandlerId)
    if (authHandlerId === undefined) {
      authHandlerId = this.getFirstHandlerId()
    }
    const authHandler = this._authHandlers[authHandlerId]
    return await authHandler.flow?.getUserToken(context)!
  }

  /**
   * Exchanges a token for a new token with different scopes.
   *
   * @param context - The context object for the current turn.
   * @param scopes - Array of scopes to request for the new token.
   * @param authHandlerId - Optional ID of the auth handler to use, defaults to first handler.
   * @returns A promise that resolves to the exchanged token response.
   *
   * @remarks
   * This method handles token exchange scenarios, particularly for on-behalf-of (OBO) flows.
   * It checks if the current token is exchangeable (e.g., has audience starting with 'api://')
   * and performs the appropriate token exchange using MSAL.
   *
   * Example usage:
   * ```typescript
   * const exchangedToken = await auth.exchangeToken(
   *   context,
   *   ['https://graph.microsoft.com/.default'],
   *   'microsoft'
   * );
   * ```
   */
  public async exchangeToken (context: TurnContext, scopes: string[], authHandlerId: string): Promise<TokenResponse> {
    logger.info('getToken from user token service for authHandlerId:', authHandlerId)
    if (authHandlerId === undefined) {
      authHandlerId = this.getFirstHandlerId()
    }
    const authHandler = this._authHandlers[authHandlerId]
    const tokenResponse = await authHandler.flow?.getUserToken(context)!
    if (this.isExchangeable(tokenResponse.token)) {
      return await this.handleObo(context, tokenResponse.token!, scopes)
    }
    return tokenResponse
  }

  private isExchangeable (token: string | undefined): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }
    const payload = jwt.decode(token) as JwtPayload
    return payload?.aud?.indexOf('api://') === 0
  }

  private async handleObo (context: TurnContext, token: string, scopes: string[]): Promise<TokenResponse> {
    const msalTokenProvider = new MsalTokenProvider()
    const authConfig: AuthConfiguration = context.adapter.authConfig
    const newToken = await msalTokenProvider.acquireTokenOnBehalfOf(authConfig, scopes, token)
    return { token: newToken }
  }

  /**
   * Begins or continues an OAuth flow.
   *
   * @param context - The context object for the current turn.
   * @param state - The state object for the current turn.
   * @param authHandlerId - Optional ID of the auth handler to use, defaults to first handler.
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
   * Example usage:
   * ```typescript
   * const tokenResponse = await auth.beginOrContinueFlow(context, state, 'microsoft');
   * if (tokenResponse && tokenResponse.token) {
   *   // User is now authenticated
   *   await context.sendActivity('Authentication successful!');
   * }
   * ```
   */
  public async beginOrContinueFlow (context: TurnContext, state: TurnState, authHandlerId: string) : Promise<TokenResponse> {
    if (authHandlerId === undefined) {
      authHandlerId = this.getFirstHandlerId()
    }
    logger.info('beginOrContinueFlow for authHandlerId:', authHandlerId)
    const signInState: SingInState | undefined = state.getValue('user.__SIGNIN_STATE_') || { continuationActivity: undefined, handlerId: undefined, completed: false }
    const flow = this._authHandlers[authHandlerId].flow!
    let tokenResponse: TokenResponse | undefined
    if (flow.state!.flowStarted === false) {
      tokenResponse = await flow.beginFlow(context)
      signInState!.continuationActivity = context.activity
      signInState!.handlerId = authHandlerId
      state.setValue('user.__SIGNIN_STATE_', signInState)
    } else {
      tokenResponse = await flow.continueFlow(context)
      if (tokenResponse && tokenResponse.token) {
        if (this._signInSuccessHandler) {
          await this._signInSuccessHandler(context, state, authHandlerId)
        }
        signInState!.completed = true
        state.setValue('user.__SIGNIN_STATE_', signInState)
      } else {
        logger.warn('Failed to complete OAuth flow, no token received')
        if (this._signInFailureHandler) {
          await this._signInFailureHandler(context, state, authHandlerId, 'Failed to complete the OAuth flow')
        }
        signInState!.completed = false
        state.setValue('user.__SIGNIN_STATE_', signInState)
      }
    }
    return tokenResponse!
  }

  /**
   * Gets the ID of the first configured authentication handler.
   *
   * @returns The ID of the first auth handler.
   * @throws Error if no auth handlers are configured.
   *
   * @remarks
   * This method is used as a fallback when no specific auth handler ID is provided
   * to other methods. It returns the first handler found in the configuration.
   *
   * Example usage:
   * ```typescript
   * const firstHandlerId = auth.getFirstHandlerId();
   * console.log('Default handler:', firstHandlerId);
   * ```
   */
  getFirstHandlerId = () : string => {
    const firstHandlerId = Object.keys(this._authHandlers)[0]
    if (!firstHandlerId) {
      throw new Error('No auth handlers configured')
    }
    return firstHandlerId
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
   * Example usage:
   * ```typescript
   * // Sign out from specific handler
   * await auth.signOut(context, state, 'microsoft');
   *
   * // Sign out from all handlers
   * await auth.signOut(context, state);
   * ```
   */
  async signOut (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<void> {
    logger.info('signOut for authHandlerId:', authHandlerId)
    if (authHandlerId === undefined) { // aw
      for (const ah in this._authHandlers) {
        const flow = this._authHandlers[ah].flow
        await flow?.signOut(context)
      }
    } else {
      await this._authHandlers[authHandlerId].flow?.signOut(context)
    }
  }

  /**
   * Private handler for successful sign-in events.
   * @private
   */
  _signInSuccessHandler: ((context: TurnContext, state: TurnState, authHandlerId?: string) => Promise<void>) | null = null

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
   * Example usage:
   * ```typescript
   * auth.onSignInSuccess(async (context, state, authHandlerId) => {
   *   await context.sendActivity(`Welcome! You signed in using ${authHandlerId}.`);
   *   // Perform any post-authentication setup
   * });
   * ```
   */
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, authHandlerId?: string) => Promise<void>) {
    this._signInSuccessHandler = handler
  }

  /**
   * Private handler for failed sign-in events.
   * @private
   */
  _signInFailureHandler: ((context: TurnContext, state: TurnState, authHandlerId?: string, errorMessage?: string) => Promise<void>) | null = null

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
   * Example usage:
   * ```typescript
   * auth.onSignInFailure(async (context, state, authHandlerId, errorMessage) => {
   *   await context.sendActivity(`Sign-in failed: ${errorMessage || 'Unknown error'}`);
   *   await context.sendActivity('Please try signing in again.');
   * });
   * ```
   */
  public onSignInFailure (handler: (context: TurnContext, state: TurnState, authHandlerId?: string, errorMessage?: string) => Promise<void>) {
    this._signInFailureHandler = handler
  }
}
