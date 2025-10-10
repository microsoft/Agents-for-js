/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import { Guard, GuardRegisterOptions, GuardRegisterStatus } from './types'
import { MessageFactory } from '../../messageFactory'
import { CardFactory } from '../../cards'
import { TurnContext } from '../../turnContext'
import { TokenExchangeRequest, UserTokenClient } from '../../oauth'
import { loadAuthConfigFromEnv, MsalTokenProvider } from '../../auth'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { RouteSelector } from '../routing/routeSelector'
import { AgentApplication } from '../agentApplication'
import { GuardStorage } from './guardStorage'

const logger = debug('agents:guards:authorization')

/**
 * Context data for authorization guards.
 */
export interface AuthorizationGuardContext {
  /**
   * The OAuth token acquired after successful authentication.
   */
  token: string | undefined
}

/**
 * Interface defining an authorization guard configuration.
 */
export interface AuthorizationGuardSettings {
  /**
   * Connection name for the auth provider.
   */
  name?: string,
  /**
   * Title to display on auth cards/UI.
   */
  title?: string,
  /**
   * Text to display on auth cards/UI.
   */
  text?: string,
  /**
   * Prefix to load the authentication configuration from environment variables.
   * @see {@link loadAuthConfigFromEnv}
   */
  cnxPrefix?: string
  /**
   * List of OAuth scopes required by the auth provider. Usually used for on-behalf-of token exchanges.
   */
  scopes?: string[]
  /**
   * Trigger to cancel the ongoing auth flow (string, RegExp, or RouteSelector).
   */
  cancelTrigger?: string | RegExp | RouteSelector
  /**
   * Maximum number of attempts for entering the magic code.
   */
  maxAttempts?: number
}

/**
 * Interface for token verification state.
 */
interface TokenVerifyState {
  state: string
}

/**
 * Interface for sign-in failure value.
 */
interface SignInFailureValue {
  code: string
  message: string
}

const SIGN_IN_ATTEMPTS = 3

/**
 * Guard implementation for OAuth authorization flows.
 */
export class AuthorizationGuard implements Guard {
  private _onSuccess?: Parameters<AuthorizationGuard['onSuccess']>[0]
  private _onFailure?: Parameters<AuthorizationGuard['onFailure']>[0]
  private _onCancelled?: Parameters<AuthorizationGuard['onCancelled']>[0]

  /**
   * Creates an instance of the AuthorizationGuard.
   * @param id The unique identifier for the guard.
   * @param settings The settings for the guard.
   * @param app The agent application instance.
   */
  constructor (public id: string, public settings: AuthorizationGuardSettings, private app : AgentApplication<any>) {
    if (!settings.name) {
      throw new Error(this.prefix('The \'name\' property is required to initialize the guard.'))
    }

    if (!app.adapter.userTokenClient) {
      throw new Error(this.prefix('The \'userTokenClient\' is not available in the adapter. Ensure that the adapter supports user token operations.'))
    }

    if (!app.adapter.authProvider) {
      throw new Error(this.prefix('The \'authProvider\' is not available in the adapter. Ensure that the adapter supports authentication.'))
    }

    if (!app.adapter.authConfig) {
      throw new Error(this.prefix('The \'authConfig\' is not available in the adapter. Ensure that the adapter is properly configured.'))
    }

    if (!app.options.storage) {
      throw new Error(this.prefix('The \'storage\' option is not available in the app options. Ensure that the app is properly configured.'))
    }
  }

  private _key = `${AuthorizationGuard.name}/${this.id}`

  /**
   * Maximum number of attempts for magic code entry.
   */
  private get maxAttempts (): number {
    const attempts = this.settings.maxAttempts
    const result = typeof attempts === 'number' && Number.isFinite(attempts) ? Math.round(attempts) : NaN
    return result > 0 ? result : SIGN_IN_ATTEMPTS
  }

  /**
   * Gets the authorization context from the turn state.
   * @param context The turn context.
   */
  async context (context: TurnContext): Promise<AuthorizationGuardContext> {
    const registered = context.turnState.get(this._key)
    if (registered) {
      return registered()
    }

    const { activity } = context
    const userTokenClient = await this.getUserTokenClient()
    // Using getTokenOrSignInResource instead of getUserToken to avoid HTTP 404 errors.
    const { tokenResponse } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this.settings.name!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, '')
    return { token: tokenResponse?.token }
  }

  /**
   * Cancels the ongoing authorization flow.
   * @param context The turn context.
   * @returns True if the cancellation was successful, false otherwise.
   */
  async cancel (context:TurnContext): Promise<boolean> {
    const storage = new GuardStorage(this.app.options.storage!, context)
    const active = await storage.read()

    if (active?.guard !== this.id) {
      return false
    }

    logger.debug(this.prefix('Cancelling active session'), context.activity)
    await storage.delete()
    await this._onCancelled?.(context)
    return true
  }

  /**
   * Logs out the user from the service.
   * @param context The turn context.
   * @returns True if the logout was successful, false otherwise.
   */
  async logout (context: TurnContext): Promise<boolean> {
    const user = context.activity.from?.id
    const channel = context.activity.channelId
    const connection = this.settings.name!

    if (!channel || !user) {
      throw new Error('Both \'activity.channelId\' and \'activity.from.id\' are required to perform logout.')
    }

    logger.debug(this.prefix(`Signing out User '${user}' from => Channel: '${channel}', Connection: '${connection}'`), context.activity)
    const userTokenClient = await this.getUserTokenClient()
    await userTokenClient.signOut(user, connection, channel)
    return true
  }

  /**
   * Sets a handler to be called when a user successfully signs in.
   * @param callback The callback function to be invoked on successful sign-in.
   */
  onSuccess (callback: (context: TurnContext, data: AuthorizationGuardContext) => Promise<void> | void): void {
    this._onSuccess = callback
  }

  /**
   * Sets a handler to be called when a user fails to sign in.
   * @param callback The callback function to be invoked on sign-in failure.
   */
  onFailure (callback: (context: TurnContext, reason: string) => Promise<void> | void): void {
    this._onFailure = callback
  }

  /**
   * Sets a handler to be called when a user cancels the sign-in process.
   * @param callback The callback function to be invoked on sign-in cancellation.
   */
  onCancelled (callback: (context: TurnContext) => Promise<void> | void): void {
    this._onCancelled = callback
  }

  /**
   * Registers this guard for the current context.
   * @param options Registration options including context, and active guard state.
   */
  async register (options: GuardRegisterOptions): Promise<GuardRegisterStatus> {
    const { context, active } = options
    const { activity } = context
    const storage = new GuardStorage(this.app.options.storage!, context)

    const userTokenClient = await this.getUserTokenClient()

    if (!active) {
      return this.setToken(options, storage)
    }

    if (await this.isCancellationRequested(context)) {
      logger.debug(this.prefix('User requested to cancel the sign-in process by using the \'cancelTrigger\' setting'), activity)
      await storage.delete()
      await this._onCancelled?.(context)
      return GuardRegisterStatus.REJECTED
    }

    if (active.activity.conversation?.id !== activity.conversation?.id) {
      logger.debug(this.prefix('Discarding the active session due to the conversation has changed during an active sign-in process'), activity)
      return GuardRegisterStatus.IGNORED
    }

    if (activity.name === 'signin/tokenExchange') {
      const { token } = await userTokenClient.exchangeTokenAsync(activity.from?.id!, this.settings.name!, activity.channelId!, activity.value as TokenExchangeRequest)
      if (!token) {
        const reason = 'Failed to exchange token.'
        logger.error(this.prefix(reason))
        await this._onFailure?.(context, reason)
        return GuardRegisterStatus.REJECTED
      }

      logger.debug(this.prefix('Successfully exchanged token'))
      this.setContext(context, { token })
      await this._onSuccess?.(context, { token })
      return GuardRegisterStatus.APPROVED
    }

    if (activity.name === 'signin/failure') {
      const reason = 'Failed to sign-in'
      const value = activity.value as SignInFailureValue
      logger.error(this.prefix(reason), value, activity)
      await context.sendActivity(MessageFactory.text(`${reason}. Please try again.`))
      await this._onFailure?.(context, value.message || reason)
      return GuardRegisterStatus.REJECTED
    }

    const { status, code } = await this.codeVerification(options, storage)
    if (status !== GuardRegisterStatus.APPROVED) {
      return status
    }

    const result = await this.setToken(options, storage, code)
    if (result !== GuardRegisterStatus.APPROVED) {
      return result
    }

    const data = await this.context(context)
    if (this.isExchangeable(data.token)) {
      return this.handleObo(context, data.token!)
    }

    await this._onSuccess?.(context, data)
    return result
  }

  /**
   * Checks if the sign-in process can be cancelled.
   */
  private async isCancellationRequested (context : TurnContext): Promise<boolean> {
    const trigger = this.settings.cancelTrigger
    if (!trigger) {
      return false
    }

    if (typeof trigger === 'function') {
      return trigger(context)
    }

    if (trigger instanceof RegExp) {
      return trigger.test(context.activity.text ?? '')
    }

    return context.activity.text?.toLocaleLowerCase() === trigger.toLocaleLowerCase()
  }

  /**
   * Checks if a token is exchangeable for an on-behalf-of flow.
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
   */
  private async handleObo (context: TurnContext, token: string): Promise<GuardRegisterStatus> {
    const { cnxPrefix, scopes } = this.settings
    if (!scopes) {
      throw new Error(this.prefix('Cannot perform on-behalf-of token exchange without scopes setting'))
    }

    try {
      const msalTokenProvider = new MsalTokenProvider()
      const authConfig = cnxPrefix ? loadAuthConfigFromEnv(cnxPrefix) : context.adapter.authConfig
      const newToken = await msalTokenProvider.acquireTokenOnBehalfOf(authConfig, scopes, token)
      logger.debug(this.prefix('Successfully acquired on-behalf-of token'))
      this.setContext(context, { token: newToken })
      await this._onSuccess?.(context, { token: newToken })
      return GuardRegisterStatus.APPROVED
    } catch (error) {
      const reason = `Failed to exchange on-behalf-of token: ${(error as Error).message}`
      logger.error(this.prefix(reason), error)
      await this._onFailure?.(context, reason)
      return GuardRegisterStatus.REJECTED
    }
  }

  /**
   * Sets the token from the token response or initiates the sign-in flow.
   */
  private async setToken ({ context, active }: GuardRegisterOptions, storage: GuardStorage, code?: string): Promise<GuardRegisterStatus> {
    const { activity } = context

    const userTokenClient = await this.getUserTokenClient()
    const { tokenResponse, signInResource } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this.settings.name!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, code ?? '')

    if (!tokenResponse && active) {
      logger.warn(this.prefix('Invalid code entered. Restarting sign-in flow'), activity)
      await context.sendActivity(MessageFactory.text('The code entered is invalid. Please sign-in again to continue.'))
    }

    if (!tokenResponse) {
      logger.debug(this.prefix('Cannot find token. Sending sign-in card'), activity)
      const oCard = CardFactory.oauthCard(this.settings.name!, this.settings.title!, this.settings.text!, signInResource)
      await context.sendActivity(MessageFactory.attachment(oCard))
      await storage.write({ activity, guard: this.id, ...(active ?? {}), attemptsLeft: this.maxAttempts })
      return GuardRegisterStatus.PENDING
    }

    logger.debug(this.prefix('Successfully acquired token'), activity)
    const guardContext: AuthorizationGuardContext = { token: tokenResponse.token }
    this.setContext(context, guardContext)
    return GuardRegisterStatus.APPROVED
  }

  /**
   * Verifies the magic code provided by the user.
   */
  private async codeVerification ({ context, active }: GuardRegisterOptions, storage: GuardStorage): Promise<{ status: GuardRegisterStatus, code?: string }> {
    if (!active) {
      logger.debug(this.prefix('No active session found. Skipping code verification.'), context.activity)
      return { status: GuardRegisterStatus.IGNORED }
    }

    const { activity } = context
    let state: string | undefined = activity.text

    if (active.attemptsLeft <= 0) {
      logger.warn(this.prefix('Maximum sign-in attempts exceeded'), activity)
      await context.sendActivity(MessageFactory.text('You have exceeded the maximum number of sign-in attempts.'))
      await this._onCancelled?.(context)
      return { status: GuardRegisterStatus.REJECTED }
    }

    if (activity.name === 'signin/verifyState') {
      logger.debug(this.prefix('Getting code from activity.value'), activity)
      const { state: teamsState } = activity.value as TokenVerifyState
      state = teamsState
    }

    if (state === 'CancelledByUser') {
      logger.warn(this.prefix('Sign-in process was cancelled by the user'), activity)
      await this._onCancelled?.(context)
      return { status: GuardRegisterStatus.REJECTED }
    }

    if (!state?.match(/^\d{6}$/)) {
      logger.warn(this.prefix(`Invalid magic code entered. Attempts left: ${active.attemptsLeft}`), activity)
      await context.sendActivity(MessageFactory.text(`Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**${active.attemptsLeft} attempt(s) left...**`))
      await storage.write({ ...active, attemptsLeft: active.attemptsLeft - 1 })
      return { status: GuardRegisterStatus.PENDING }
    }

    logger.debug(this.prefix('Code verification successful'), activity)
    return { status: GuardRegisterStatus.APPROVED, code: state }
  }

  /**
   * Sets the authorization context in the turn state.
   */
  private setContext (context: TurnContext, data: AuthorizationGuardContext) {
    return context.turnState.set(this._key, () => data)
  }

  /**
   * Gets the user token client, ensuring it has a valid auth token.
   */
  private async getUserTokenClient (): Promise<UserTokenClient> {
    const userTokenClient = this.app.adapter.userTokenClient
    if (!userTokenClient?.client.defaults.headers.common.Authorization) {
      const accessToken = await this.app.adapter.authProvider.getAccessToken(this.app.adapter.authConfig, 'https://api.botframework.com')
      userTokenClient?.updateAuthToken(accessToken)
    }

    return userTokenClient!
  }

  /**
   * Prefixes a message with the guard ID.
   */
  private prefix (message: string) {
    return `[guard:${this.id}] ${message}`
  }
}
