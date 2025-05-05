/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../../turnContext'
import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'
import { OAuthFlow, TokenResponse } from '../../oauth'
import { UserState } from '../../state'

const logger = debug('agents:authorization')

/**
 * Interface defining an authorization handler for OAuth flows
 * @interface AuthHandler
 */
export interface AuthHandler {
  /** Connection name for the auth provider */
  name?: string,
  /** Whether authorization should be triggered automatically */
  auto?: boolean,
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
 */
export interface AuthorizationHandlers extends Record<string, AuthHandler> {}

/**
 * Class responsible for managing authorization and OAuth flows
 * @class Authorization
 */
export class Authorization {
  _authHandlers: AuthorizationHandlers

  /**
   * Creates a new instance of UserAuthorization.
   * @param {Storage} storage - The storage system to use for state management.
   * @param {AuthorizationHandlers} authHandlers - Configuration for OAuth providers
   * @throws {Error} If storage is null/undefined or no auth handlers are provided
   */
  constructor (storage: Storage, authHandlers: AuthorizationHandlers) {
    if (storage === undefined || storage === null) {
      throw new Error('Storage is required for UserAuthorization')
    }
    const userState = new UserState(storage)
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
      currentAuthHandler.auto = currentAuthHandler.auto ?? process.env[ah + '_connectionAuto'] === 'true'
      currentAuthHandler.flow = new OAuthFlow(userState, currentAuthHandler.name, null!, currentAuthHandler.title, currentAuthHandler.text)
    }
    logger.info('Authorization handlers configured with', this._authHandlers.length, 'handlers')
  }

  /**
   * Gets the token for a specific auth handler
   * @param {TurnContext} context - The context object for the current turn
   * @param {string} [authHandlerId] - Optional ID of the auth handler to use, defaults to first handler
   * @returns {Promise<TokenResponse>} The token response from the OAuth provider
   */
  public async getToken (context: TurnContext, authHandlerId?: string): Promise<TokenResponse> {
    logger.info('getToken from user token service for authHandlerId:', authHandlerId)
    const authHandler = this.resolverHandler(authHandlerId)
    return await authHandler.flow?.getUserToken(context)!
  }

  /**
   * Begins or continues an OAuth flow
   * @param {TurnContext} context - The context object for the current turn
   * @param {TurnState} state - The state object for the current turn
   * @param {string} [authHandlerId] - Optional ID of the auth handler to use, defaults to first handler
   * @returns {Promise<TokenResponse>} The token response from the OAuth provider
   */
  public async beginOrContinueFlow (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<TokenResponse> {
    logger.info('beginOrContinueFlow for authHandlerId:', authHandlerId)
    const flow = this.resolverHandler(authHandlerId).flow!
    let tokenResponse: TokenResponse
    if (flow.state!.flowStarted === false) {
      tokenResponse = await flow.beginFlow(context)
    } else {
      tokenResponse = await flow.continueFlow(context)
      if (tokenResponse && tokenResponse.token) {
        if (this._signInHandler) {
          await this._signInHandler(context, state, authHandlerId)
        }
      }
    }
    return tokenResponse
  }

  /**
   * Gets the current state of the OAuth flow
   * @param {string} [authHandlerId] - Optional ID of the auth handler to check, defaults to first handler
   * @returns {boolean} Whether the flow has started
   */
  public getFlowState (authHandlerId?: string) : boolean {
    const flow = this.resolverHandler(authHandlerId).flow!
    return flow.state?.flowStarted!
  }

  /**
   * Resolves the auth handler to use based on the provided ID
   * @param {string} [authHandlerId] - Optional ID of the auth handler to resolve, defaults to first handler
   * @returns {AuthHandler} The resolved auth handler
   */
  resolverHandler = (authHandlerId?: string) : AuthHandler => {
    if (authHandlerId) {
      return this._authHandlers![authHandlerId]
    }
    return this._authHandlers![Object.keys(this._authHandlers)[0]]
  }

  /**
   * Signs out the current user.
   * This method clears the user's token and resets the SSO state.
   *
   * @param {TurnContext} context - The context object for the current turn.
   * @param {TurnState} state - The state object for the current turn.
   * @param {string} [authHandlerId] - Optional ID of the auth handler to use for sign out
   * @returns {Promise<void>}
   */
  async signOut (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<void> {
    logger.info('signOut for authHandlerId:', authHandlerId)
    if (authHandlerId === undefined) { // aw
      for (const ah in this._authHandlers) {
        const flow = this._authHandlers[ah].flow
        await flow?.signOut(context)
      }
    } else {
      await this.resolverHandler(authHandlerId).flow?.signOut(context)
    }
  }

  _signInHandler: ((context: TurnContext, state: TurnState, authHandlerId?: string) => void) | null = null

  /**
   * Sets a handler to be called when sign-in is successfully completed
   * @param {Function} handler - The handler function to call on successful sign-in
   */
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, authHandlerId?: string) => void) {
    this._signInHandler = handler
  }
}
