/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import { AuthorizationHandlerStatus, AuthorizationHandler, ActiveAuthorizationHandler } from '../types'
import { MessageFactory } from '../../../messageFactory'
import { CardFactory } from '../../../cards'
import { TurnContext } from '../../../turnContext'
import { TokenExchangeRequest, TokenResponse, UserTokenClient } from '../../../oauth'
import { loadAuthConfigFromEnv, MsalTokenProvider } from '../../../auth'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { AgentApplication } from '../../agentApplication'
import { HandlerStorage } from '../handlerStorage'
import { Activity, ActivityTypes, Channels } from '@microsoft/agents-activity'
import { InvokeResponse } from '../../../invoke'

const logger = debug('agents:authorization:azurebot')

const DEFAULT_SIGN_IN_ATTEMPTS = 2

/**
 * Active handler manager information.
 */
export interface AzureBotActiveHandler extends ActiveAuthorizationHandler {
  /**
   * The number of attempts left for the handler to process in case of failure.
   */
  attemptsLeft: number
}

/**
 * Messages configuration for the AzureBotAuthorization handler.
 */
export interface AzureBotAuthorizationOptionsMessages {
  /**
   * Message displayed when an invalid code is entered.
   * Use `{code}` as a placeholder for the entered code.
   * Defaults to: 'The code entered is invalid. Please sign-in again to continue.'
   */
  invalidCode?: string
  /**
   * Message displayed when the entered code format is invalid.
   * Use `{attemptsLeft}` as a placeholder for the number of attempts left.
   * Defaults to: 'Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**{attemptsLeft} attempt(s) left...**'
   */
  invalidCodeFormat?: string
  /**
   * Message displayed when the maximum number of attempts is exceeded.
   * Use `{maxAttempts}` as a placeholder for the maximum number of attempts.
   * Defaults to: 'You have exceeded the maximum number of sign-in attempts ({maxAttempts}).'
   */
  maxAttemptsExceeded?: string
}

/**
 * Interface defining an authorization handler configuration.
 */
export interface AzureBotAuthorizationOptions {
  /**
   * The type of authorization handler.
   * This property is optional and should not be set when configuring this handler.
   * It is included here for completeness and type safety.
   */
  type?: undefined
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
   * Maximum number of attempts for entering the magic code. Defaults to 2.
   */
  maxAttempts?: number
  /**
   * Messages to display for various authentication scenarios.
   */
  messages?: AzureBotAuthorizationOptionsMessages
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

interface TokenExchangeInvokeResponse {
  connectionName: string
  id?: string
  failureDetail?: string
}

/**
 * Default implementation of an authorization handler using Azure Bot Service.
 */
export class AzureBotAuthorization implements AuthorizationHandler {
  private _settings: AzureBotAuthorizationOptions
  private _onSuccess?: Parameters<AuthorizationHandler['onSuccess']>[0]
  private _onFailure?: Parameters<AuthorizationHandler['onFailure']>[0]

  /**
   * Creates an instance of the AzureBotAuthorization.
   * @param id The unique identifier for the handler.
   * @param settings The settings for the handler.
   * @param app The agent application instance.
   */
  constructor (private app : AgentApplication<any>, public readonly id: string, settings: AzureBotAuthorizationOptions) {
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

    this._settings = this.loadSettings(settings)
  }

  private loadSettings (settings: AzureBotAuthorizationOptions) {
    const result: AzureBotAuthorizationOptions = {
      name: settings.name ?? (process.env[`${this.id}_connectionName`]),
      title: settings.title ?? (process.env[`${this.id}_connectionTitle`]),
      text: settings.text ?? (process.env[`${this.id}_connectionText`]),
      cnxPrefix: settings.cnxPrefix ?? (process.env[`${this.id}_cnxPrefix`]),
      maxAttempts: settings.maxAttempts ?? parseInt(process.env[`${this.id}_maxAttempts`]!),
      messages: {
        invalidCode: settings.messages?.invalidCode ?? process.env[`${this.id}_messages_invalidCode`],
        invalidCodeFormat: settings.messages?.invalidCodeFormat ?? process.env[`${this.id}_messages_invalidCodeFormat`],
        maxAttemptsExceeded: settings.messages?.maxAttemptsExceeded ?? process.env[`${this.id}_messages_maxAttemptsExceeded`],
      }
    }

    if (!result.name) {
      throw new Error(this.prefix(`The 'name' property or '${this.id}_connectionName' env variable is required to initialize the handler.`))
    }

    return result
  }

  /**
   * Maximum number of attempts for magic code entry.
   */
  private get maxAttempts (): number {
    const attempts = this._settings.maxAttempts
    const result = typeof attempts === 'number' && Number.isFinite(attempts) ? Math.round(attempts) : NaN
    return result > 0 ? result : DEFAULT_SIGN_IN_ATTEMPTS
  }

  /**
   * Sets a handler to be called when a user successfully signs in.
   * @param callback The callback function to be invoked on successful sign-in.
   */
  onSuccess (callback: (context: TurnContext) => Promise<void> | void): void {
    this._onSuccess = callback
  }

  /**
   * Sets a handler to be called when a user fails to sign in.
   * @param callback The callback function to be invoked on sign-in failure.
   */
  onFailure (callback: (context: TurnContext, reason?: string) => Promise<void> | void): void {
    this._onFailure = callback
  }

  /**
   * Retrieves the token for the user, optionally using on-behalf-of flow for specified scopes.
   * @param context The turn context.
   * @param scopes Optional scopes for on-behalf-of token acquisition.
   * @returns The token response containing the token or undefined if not available.
   */
  async token (context: TurnContext, scopes?: string[]): Promise<TokenResponse> {
    let { token } = this.getContext(context)

    if (!token?.trim()) {
      const { activity } = context

      const userTokenClient = await this.getUserTokenClient()
      // Using getTokenOrSignInResource instead of getUserToken to avoid HTTP 404 errors.
      const { tokenResponse } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this._settings.name!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, '')
      token = tokenResponse?.token
    }

    if (!token?.trim()) {
      return { token: undefined }
    }

    if (!scopes || scopes.length === 0) {
      return { token }
    }

    return await this.handleOBO(context, token, scopes)
  }

  /**
   * Signs out the user from the service.
   * @param context The turn context.
   * @returns True if the signout was successful, false otherwise.
   */
  async signout (context: TurnContext): Promise<boolean> {
    const user = context.activity.from?.id
    const channel = context.activity.channelId
    const connection = this._settings.name!

    if (!channel || !user) {
      throw new Error('Both \'activity.channelId\' and \'activity.from.id\' are required to perform signout.')
    }

    logger.debug(this.prefix(`Signing out User '${user}' from => Channel: '${channel}', Connection: '${connection}'`), context.activity)
    const userTokenClient = await this.getUserTokenClient()
    await userTokenClient.signOut(user, connection, channel)
    return true
  }

  /**
   * Initiates the sign-in process for the handler.
   * @param context The turn context.
   * @param active Optional active handler data.
   * @returns The status of the sign-in attempt.
   */
  async signin (context: TurnContext, active?: AzureBotActiveHandler): Promise<AuthorizationHandlerStatus> {
    const { activity } = context

    const storage = new HandlerStorage<AzureBotActiveHandler>(this.app.options.storage!, context)
    const userTokenClient = await this.getUserTokenClient()

    if (active) {
      logger.debug(this.prefix('Sign-in active session detected'), active.activity)
    } else {
      return this.setToken(storage, context)
    }

    if (active.activity.conversation?.id !== activity.conversation?.id) {
      await this.sendInvokeResponse(context, { status: 400 })
      logger.debug(this.prefix('Discarding the active session due to the conversation has changed during an active sign-in process'), activity)
      return AuthorizationHandlerStatus.IGNORED
    }

    if (activity.name === 'signin/tokenExchange') {
      const tokenExchangeRequest = activity.value as TokenExchangeRequest
      if (!tokenExchangeRequest?.token) {
        const reason = 'The Agent received an InvokeActivity that is missing a TokenExchangeInvokeRequest value. This is required to be sent with the InvokeActivity.'
        await this.sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 400,
          body: { connectionName: this._settings.name!, failureDetail: reason }
        })
        logger.error(this.prefix(reason))
        await this._onFailure?.(context, reason)
        return AuthorizationHandlerStatus.REJECTED
      }

      if (tokenExchangeRequest.connectionName !== this._settings.name) {
        const reason = `The Agent received an InvokeActivity with a TokenExchangeInvokeRequest for a different connection name ('${tokenExchangeRequest.connectionName}') than expected ('${this._settings.name}').`
        await this.sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 400,
          body: { id: tokenExchangeRequest.id, connectionName: this._settings.name!, failureDetail: reason }
        })
        logger.error(this.prefix(reason))
        await this._onFailure?.(context, reason)
        return AuthorizationHandlerStatus.REJECTED
      }

      const { token } = await userTokenClient.exchangeTokenAsync(activity.from?.id!, this._settings.name!, activity.channelId!, tokenExchangeRequest)
      if (!token) {
        const reason = 'Unable to exchange token. The token provided in the TokenExchangeRequest was rejected by the token service.'
        await this.sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 412,
          body: { id: tokenExchangeRequest.id, connectionName: this._settings.name!, failureDetail: reason }
        })
        logger.error(this.prefix(reason))
        await this._onFailure?.(context, reason)
        return AuthorizationHandlerStatus.REJECTED
      }

      await this.sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
        status: 200,
        body: { id: tokenExchangeRequest.id, connectionName: this._settings.name! }
      })
      logger.debug(this.prefix('Successfully exchanged token'))
      this.setContext(context, { token })
      await this._onSuccess?.(context)
      return AuthorizationHandlerStatus.APPROVED
    }

    if (activity.name === 'signin/failure') {
      await this.sendInvokeResponse(context, { status: 200 })
      const reason = 'Failed to sign-in'
      const value = activity.value as SignInFailureValue
      logger.error(this.prefix(reason), value, activity)
      if (this._onFailure) {
        await this._onFailure(context, value.message || reason)
      } else {
        await context.sendActivity(MessageFactory.text(`${reason}. Please try again.`))
      }
      return AuthorizationHandlerStatus.REJECTED
    }

    const { status, code } = await this.codeVerification(storage, context, active)
    if (status !== AuthorizationHandlerStatus.APPROVED) {
      return status
    }

    try {
      const result = await this.setToken(storage, context, active, code)
      if (result !== AuthorizationHandlerStatus.APPROVED) {
        await this.sendInvokeResponse(context, { status: 404 })
        return result
      }

      await this.sendInvokeResponse(context, { status: 200 })
      await this._onSuccess?.(context)
      return result
    } catch (error) {
      await this.sendInvokeResponse(context, { status: 500 })
      throw error
    }
  }

  /**
   * Handles on-behalf-of token acquisition.
   */
  private async handleOBO (context: TurnContext, token:string, scopes: string[]): Promise<TokenResponse> {
    const { cnxPrefix } = this._settings

    if (!this.isExchangeable(token)) {
      throw new Error(this.prefix('The current token is not exchangeable for an on-behalf-of flow. Ensure the token audience starts with \'api://\'.'))
    }

    const msalTokenProvider = new MsalTokenProvider()
    const authConfig = cnxPrefix ? loadAuthConfigFromEnv(cnxPrefix) : context.adapter.authConfig

    try {
      const newToken = await msalTokenProvider.acquireTokenOnBehalfOf(authConfig, scopes, token)
      logger.debug(this.prefix('Successfully acquired on-behalf-of token'))
      await this._onSuccess?.(context)
      return { token: newToken }
    } catch (error) {
      const reason = `Failed to exchange on-behalf-of token for scopes: [${scopes.join(', ')}]`
      logger.error(this.prefix(reason), error)
      await this._onFailure?.(context, reason)
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
   * Sets the token from the token response or initiates the sign-in flow.
   */
  private async setToken (storage: HandlerStorage<AzureBotActiveHandler>, context: TurnContext, active?: AzureBotActiveHandler, code?: string): Promise<AuthorizationHandlerStatus> {
    const { activity } = context

    const userTokenClient = await this.getUserTokenClient()
    const { tokenResponse, signInResource } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this._settings.name!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, code ?? '')

    if (!tokenResponse && active) {
      logger.warn(this.prefix('Invalid code entered. Restarting sign-in flow'), activity)
      await context.sendActivity(MessageFactory.text(this.messages.invalidCode(code ?? '')))
      return AuthorizationHandlerStatus.REJECTED
    }

    if (!tokenResponse) {
      logger.debug(this.prefix('Cannot find token. Sending sign-in card'), activity)
      const oCard = CardFactory.oauthCard(this._settings.name!, this._settings.title!, this._settings.text!, signInResource)
      await context.sendActivity(MessageFactory.attachment(oCard))
      await storage.write({ activity, id: this.id, ...(active ?? {}), attemptsLeft: this.maxAttempts })
      return AuthorizationHandlerStatus.PENDING
    }

    logger.debug(this.prefix('Successfully acquired token'), activity)
    this.setContext(context, { token: tokenResponse.token })
    return AuthorizationHandlerStatus.APPROVED
  }

  /**
   * Verifies the magic code provided by the user.
   */
  private async codeVerification (storage: HandlerStorage<AzureBotActiveHandler>, context: TurnContext, active?: AzureBotActiveHandler): Promise<{ status: AuthorizationHandlerStatus, code?: string }> {
    if (!active) {
      logger.debug(this.prefix('No active session found. Skipping code verification.'), context.activity)
      return { status: AuthorizationHandlerStatus.IGNORED }
    }

    const { activity } = context
    let state: string | undefined = activity.text

    if (active.attemptsLeft <= 0) {
      logger.warn(this.prefix('Maximum sign-in attempts exceeded'), activity)
      await context.sendActivity(MessageFactory.text(this.messages.maxAttemptsExceeded(this.maxAttempts)))
      return { status: AuthorizationHandlerStatus.REJECTED }
    }

    if (activity.name === 'signin/verifyState') {
      logger.debug(this.prefix('Getting code from activity.value'), activity)
      const { state: teamsState } = activity.value as TokenVerifyState
      state = teamsState
    }

    if (state === 'CancelledByUser') {
      await this.sendInvokeResponse(context, { status: 200 })
      logger.warn(this.prefix('Sign-in process was cancelled by the user'), activity)
      return { status: AuthorizationHandlerStatus.REJECTED }
    }

    if (!state?.match(/^\d{6}$/)) {
      logger.warn(this.prefix(`Invalid magic code entered. Attempts left: ${active.attemptsLeft}`), activity)
      await context.sendActivity(MessageFactory.text(this.messages.invalidCodeFormat(active.attemptsLeft)))
      await storage.write({ ...active, attemptsLeft: active.attemptsLeft - 1 })
      return { status: AuthorizationHandlerStatus.PENDING }
    }

    logger.debug(this.prefix('Code verification successful'), activity)
    return { status: AuthorizationHandlerStatus.APPROVED, code: state }
  }

  private _key = `${AzureBotAuthorization.name}/${this.id}`

  /**
   * Sets the authorization context in the turn state.
   */
  private setContext (context: TurnContext, data: TokenResponse) {
    return context.turnState.set(this._key, () => data)
  }

  /**
   * Gets the authorization context from the turn state.
   */
  private getContext (context: TurnContext): TokenResponse {
    const result = context.turnState.get(this._key)
    return result?.() ?? { token: undefined }
  }

  /**
   * Gets the user token client, ensuring it has a valid auth token.
   */
  private async getUserTokenClient (): Promise<UserTokenClient> {
    const userTokenClient = this.app.adapter.userTokenClient
    const accessToken = await this.app.adapter.authProvider.getAccessToken(this.app.adapter.authConfig, 'https://api.botframework.com')
    userTokenClient?.updateAuthToken(accessToken)
    return userTokenClient!
  }

  /**
   * Sends an InvokeResponse activity if the channel is Microsoft Teams.
   */
  private sendInvokeResponse <T>(context: TurnContext, response: InvokeResponse<T>) {
    if (context.activity.channelId !== Channels.Msteams) {
      return Promise.resolve()
    }

    return context.sendActivity(Activity.fromObject({
      type: ActivityTypes.InvokeResponse,
      value: response
    }))
  }

  /**
   * Prefixes a message with the handler ID.
   */
  private prefix (message: string) {
    return `[handler:${this.id}] ${message}`
  }

  /**
   * Predefined messages with dynamic placeholders.
   */
  private messages = {
    invalidCode: (code: string) => {
      const message = this._settings.messages?.invalidCode ?? 'Invalid **{code}** code entered. Please try again with a new sign-in request.'
      return message.replaceAll('{code}', code)
    },
    invalidCodeFormat: (attemptsLeft: number) => {
      const message = this._settings.messages?.invalidCodeFormat ?? 'Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**{attemptsLeft} attempt(s) left...**'
      return message.replaceAll('{attemptsLeft}', attemptsLeft.toString())
    },
    maxAttemptsExceeded: (maxAttempts: number) => {
      const message = this._settings.messages?.maxAttemptsExceeded ?? 'You have exceeded the maximum number of sign-in attempts ({maxAttempts}). Please try again with a new sign-in request.'
      return message.replaceAll('{maxAttempts}', maxAttempts.toString())
    },
  }
}
