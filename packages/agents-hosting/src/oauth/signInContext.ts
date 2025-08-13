/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import jwt, { JwtPayload } from 'jsonwebtoken'

import type { AuthHandler, AuthorizationHandlers, SignInHandlerState } from './authorization.types'
import type { TokenResponse } from './userTokenClient.types'
import { SignInStorage } from './signInStorage'
import { FlowState } from './oAuthFlow'
import { TurnContext } from '../turnContext'
import { AuthConfiguration, loadAuthConfigFromEnv, MsalTokenProvider } from '../auth'

const logger = debug('agents:signin-context')

/**
 * Context for managing sign-in operations.
 * Handles the OAuth flow, token retrieval, and sign-out operations.
 *
 * @remarks
 * The SignInContext class provides methods to manage the OAuth flow lifecycle,
 * including starting, continuing, and completing the sign-in process.
 * It also supports token exchange and sign-out operations.
 *
 * Key features:
 * - Handles OAuth flow state management
 * - Provides methods for token retrieval and exchange
 * - Supports sign-out operations
 * - Allows custom success/failure handlers
 */
export class SignInContext {
  private _onSuccessHandler: Parameters<SignInContext['onSuccess']>[0] = undefined
  private _onFailureHandler: Parameters<SignInContext['onFailure']>[0] = undefined
  private _authHandler: AuthHandler = {}
  private _handler: SignInHandlerState | undefined = undefined

  /** Current sign-in handler state. */
  get handler (): SignInHandlerState {
    if (!this._handler) {
      throw new Error('SignInContext handler is not initialized. Call loadHandler() first.')
    }
    return this._handler
  }

  /** Logger for the sign-in context, prepends handler ID to log messages. */
  logger = {
    info: (msg: string, ...args: any[]) => logger.info(`[handler:${this.handler.id}] ${msg}`, ...args),
    warn: (msg: string, ...args: any[]) => logger.warn(`[handler:${this.handler.id}] ${msg}`, ...args),
    error: (msg: string, ...args: any[]) => logger.error(`[handler:${this.handler.id}] ${msg}`, ...args),
    debug: (msg: string, ...args: any[]) => logger.debug(`[handler:${this.handler.id}] ${msg}`, ...args)
  }

  /**
   * Creates a new instance of SignInContext.
   *
   * @param storage - The storage system to use for sign-in state management.
   * @param authHandler - Dictionary of configured authentication handlers.
   * @param context - The TurnContext for the current turn.
   * @param handlerId - ID of the auth handler to use.
   * @param isStartedFromRoute - Whether the flow is started from an AgentApplication route. Defaults to true.
   */
  constructor (public storage: SignInStorage, private authHandlers: AuthorizationHandlers, private context: TurnContext, private handlerId?: string, private isStartedFromRoute: boolean = true) {
    if (!isStartedFromRoute && !handlerId) {
      throw new Error('Cannot begin or continue OAuth flow without handlerId when isStartedFromRoute is false.')
    }

    if (!context?.activity || typeof context.activity !== 'object') {
      throw new Error('TurnContext.Activity is required for SignInContext')
    }

    if (this.isStartedFromRoute) {
      storage.setKey(context)
    }
  }

  /**
   * Sets the handler to be called when sign-in is successful.
   * @param handler - The handler function to call on sign-in success.
   */
  onSuccess (handler: (() => Promise<void> | void) | undefined = undefined) {
    this._onSuccessHandler = handler
  }

  /**
   * Sets the handler to be called when sign-in fails.
   * @param handler - The handler function to call on sign-in failure.
   */
  onFailure (handler: ((err:string) => Promise<void> | void) | undefined = undefined) {
    this._onFailureHandler = handler
  }

  /**
   * Retrieves the user token from the current sign-in handler.
   * @returns A promise that resolves to the token response.
   * @remarks
   * This method loads the handler state and retrieves the user token from the OAuth flow.
   * It is used to get the current user's authentication token after a successful sign-in.
   */
  async getUserToken (): Promise<TokenResponse> {
    if (!(await this.loadHandler())) {
      return { token: undefined }
    }
    this.logger.info('Getting token from user token service.')
    return this._authHandler.flow!.getUserToken(this.context)
  }

  /**
   * Exchanges the current user token for a new token with specified scopes.
   * @param scopes - Array of scopes to request for the new token.
   * @returns A promise that resolves to the exchanged token response.
   * @remarks
   * This method checks if the current token is exchangeable (e.g., has audience starting with 'api://')
   * and performs the appropriate token exchange using MSAL.
   */
  async exchangeToken (scopes: string[]): Promise<TokenResponse> {
    if (!(await this.loadHandler())) {
      return { token: undefined }
    }
    this.logger.info('Exchanging token from user token service.')
    const tokenResponse = await this._authHandler.flow!.getUserToken(this.context)
    if (this.isExchangeable(tokenResponse.token)) {
      return await this.handleObo(tokenResponse.token!, scopes)
    }
    return tokenResponse
  }

  /**
   * Signs out the user from the current OAuth flow.
   * @returns {Promise<void>} A promise that resolves when sign out is complete.
   * @remarks
   * This method clears the user's token and resets the authentication state.
   * It also removes the handler state from storage if `useStorageState` is true.
   */
  async signOut (): Promise<void> {
    if (!(await this.loadHandler())) {
      return
    }

    this.logger.info('Signing out from the authorization flow.')
    if (this.isStartedFromRoute) {
      await this.storage.handler.delete(this.handler.id)
    }
    return this._authHandler.flow?.signOut(this.context)
  }

  /**
   * Retrieves the token for the current sign-in handler.
   * @returns {Promise<TokenResponse | undefined>} A promise that resolves to the token response if available, or undefined if not.
   * @remarks
   * This method processes the OAuth flow based on the current handler status:
   * - If the status is 'begin', it starts a new OAuth flow.
   * - If the status is 'continue', it continues the existing flow.
   * - If the status is 'success', it retrieves the user token.
   * - If the status is 'failure', it handles the failure case.
   */
  async getToken (): Promise<TokenResponse | undefined> {
    if (!(await this.loadHandler())) {
      return { token: undefined }
    }

    this.logger.debug('Processing authorization flow.')
    this.logger.debug(`Uses Storage state: ${this.isStartedFromRoute}`)
    this.logger.debug('Current sign-in state:', this.handler)

    const tokenResponse: TokenResponse | undefined = await {
      begin: this.begin,
      continue: this.continue,
      success: this.success,
      failure: this.failure
    }[this.handler.status].bind(this)()

    this.logger.debug('OAuth flow result:', { token: tokenResponse?.token, state: this.handler })
    return tokenResponse
  }

  /**
   * Sets the current status of the sign-in handler.
   * @param status - The new status to set.
   * @returns The updated SignInHandlerState.
   * @remarks
   * This method updates the handler's state information based on the provided status.
   * @private
   */
  private setStatus (status: SignInHandlerState['status']): SignInHandlerState {
    const states: Record<SignInHandlerState['status'], () => SignInHandlerState> = {
      begin: () => ({
        id: this.handlerId ?? '',
        status,
      }),
      continue: () => ({
        ...this.handler,
        status,
        state: this._authHandler.flow?.state,
        continuationActivity: this.context.activity
      }),
      success: () => ({
        ...this.handler,
        status,
        state: undefined
      }),
      failure: () => ({
        ...this.handler,
        status,
        state: this._authHandler.flow?.state
      })
    }
    this._handler = states[status]()
    return this.handler
  }

  /**
   * Loads the current handler state from storage or initializes it.
   * If the flow has already started and `useStorageState` is false, it uses the existing state.
   * If no active flow state is found, it starts a new OAuth flow.
   * @returns {Promise<boolean>} A promise that resolves to true if the handler was successfully loaded or initialized, false otherwise.
   * @private
   */
  private async loadHandler (): Promise<boolean> {
    if (this.isStartedFromRoute) {
      this._handler = this.handlerId ? await this.storage.handler.get(this.handlerId) : await this.storage.handler.active()
    }

    if (!this._handler) {
      this._handler = this.setStatus('begin')
    }

    // If no active handler ID is set, cannot proceed.
    if (!this.handler.id) {
      return false
    }

    this._authHandler = this.getAuthHandlerOrThrow(this.handler.id)

    if (this.handler.status === 'begin') {
      // When the flow is initiated with the isStartedFromRoute flag,
      // subsequent calls (regardless of the flag's value) will use the success status
      // to determine whether to retrieve the token directly or continue the OAuth flow.
      this._authHandler.flow!.state = await this._authHandler.flow?.getFlowState(this.context) ?? {} as FlowState
      if (this._authHandler.flow?.state?.flowStarted === true) {
        this.logger.debug('OAuth flow success, using existing state.')
        this.setStatus('success')
        await this.storage.handler.set(this.handler)
        return true
      }

      this.logger.debug('No active flow state, starting a new OAuth flow.')
      await this._authHandler.flow?.signOut(this.context)
    } else {
      // Sync auth and active handler flow state.
      // If there is not active handler state, reset.
      await this._authHandler.flow?.setFlowState(this.context, this.handler.state ?? {} as FlowState)
    }

    return true
  }

  /**
   * Begins the OAuth flow by starting the sign-in process.
   * @returns {Promise<undefined>} A promise that resolves when the flow has started.
   * @private
   */
  private async begin (): Promise<undefined> {
    this.logger.debug('Beginning OAuth flow.')
    await this._authHandler.flow?.beginFlow(this.context)
    this.logger.debug('OAuth flow started, waiting on continuation ...')
    this.setStatus('continue')
    if (this.isStartedFromRoute) {
      await this.storage.handler.set(this.handler)
    }
  }

  /**
   * Continues the OAuth flow after user interaction.
   * @returns {Promise<TokenResponse | undefined>} A promise that resolves to the token response if successful, or undefined if not.
   * @private
   */
  private async continue (): Promise<TokenResponse | undefined> {
    this.logger.debug('Continuing OAuth flow.')
    const tokenResponse = await this._authHandler.flow?.continueFlow(this.context)
    if (tokenResponse?.token?.trim()) {
      this.setStatus('success')
      this.logger.debug('OAuth flow success.')
      if (this.isStartedFromRoute) {
        await this.storage.handler.set(this.handler)
      }
      if (this._onSuccessHandler) {
        await this._onSuccessHandler()
      }
    } else {
      await this.failure()
    }

    return tokenResponse
  }

  /**
   * Retrieves the user token after a successful OAuth flow.
   * @returns {Promise<TokenResponse | undefined>} A promise that resolves to the token response if successful, or undefined if not.
   * @private
   */
  private async success (): Promise<TokenResponse | undefined> {
    const tokenResponse = await this._authHandler.flow?.getUserToken(this.context)
    if (this.isStartedFromRoute && tokenResponse?.token?.trim()) {
      this.logger.debug('OAuth flow success, retrieving token.')
      return tokenResponse
    } else {
      this.logger.debug('OAuth flow token not available, waiting on continuation ...')
      return this.continue()
    }
  }

  /**
   * Handles the failure case of the OAuth flow.
   * @returns {Promise<undefined>} A promise that resolves when the failure handling is complete.
   * @private
   */
  private async failure (): Promise<undefined> {
    this.setStatus('failure')

    let errors = { reason: 'token was not received', reset: false }
    if (!this.handler.continuationActivity) {
      errors = { reason: 'no continuation activity available', reset: true }
    } else if (!this.handler.continuationActivity.conversation || !this.context.activity.conversation) {
      errors = { reason: 'conversation missing during the continuation flow', reset: true }
    } else if (this.handler.continuationActivity.conversation.id !== this.context.activity.conversation.id) {
      errors = { reason: 'conversation changed during the continuation flow', reset: true }
    } else if (!this.handler.state?.flowStarted) {
      errors = { reason: 'flow was restarted', reset: true }
    }

    const message = `Failed to complete OAuth flow due to ${errors.reason}.`
    this.logger.warn(message)

    if (errors.reset) {
      await this._authHandler.flow?.signOut(this.context)
      if (this.isStartedFromRoute) {
        await this.storage.handler.delete(this.handler.id)
      }
    }

    if (this._onFailureHandler) {
      await this._onFailureHandler(message)
    }
  }

  /**
   * Checks if a token is exchangeable for an on-behalf-of flow.
   *
   * @param token - The token to check.
   * @returns True if the token is exchangeable, false otherwise.
   * @private
   */
  private isExchangeable (token: string | undefined): boolean {
    if (!token || typeof token !== 'string') {
      return false
    }
    const payload = jwt.decode(token) as JwtPayload
    return payload?.aud?.indexOf('api://') === 0
  }

  /**
   * Handles on-behalf-of token exchange using MSAL.
   *
   * @param token - The token to exchange.
   * @param scopes - Array of scopes to request for the new token.
   * @returns A promise that resolves to the exchanged token response.
   * @private
   */
  private async handleObo (token: string, scopes: string[]): Promise<TokenResponse> {
    const msalTokenProvider = new MsalTokenProvider()
    let authConfig: AuthConfiguration = this.context.adapter.authConfig
    if (this._authHandler.cnxPrefix) {
      authConfig = loadAuthConfigFromEnv(this._authHandler.cnxPrefix)
    }
    const newToken = await msalTokenProvider.acquireTokenOnBehalfOf(authConfig, scopes, token)
    return { token: newToken }
  }

  /**
   * Gets the auth handler by ID or throws an error if not found.
   *
   * @param handlerId - ID of the auth handler to retrieve.
   * @returns The auth handler instance.
   * @throws {Error} If the auth handler with the specified ID is not configured.
   * @private
   */
  private getAuthHandlerOrThrow (handlerId: string): AuthHandler {
    if (!Object.prototype.hasOwnProperty.call(this.authHandlers, handlerId)) {
      throw new Error(`AuthHandler with ID ${handlerId} not configured`)
    }
    return this.authHandlers[handlerId]
  }
}
