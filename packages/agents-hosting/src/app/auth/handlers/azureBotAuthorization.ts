/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthorizationHandlerStatus, AuthorizationHandler, ActiveAuthorizationHandler, AuthorizationHandlerSettings, AuthorizationHandlerTokenOptions } from '../types'
import { MessageFactory } from '../../../messageFactory'
import { CardFactory } from '../../../cards'
import { TurnContext } from '../../../turnContext'
import { TokenExchangeRequest, TokenExchangeInvokeResponse, TokenResponse, UserTokenClient } from '../../../oauth'
import jwt, { JwtPayload } from 'jsonwebtoken'
import { HandlerStorage } from '../handlerStorage'
import { TokenExchangeInvokeRequest } from '../../../invoke'
import { sendInvokeResponse } from '../utils'
import { Channels, ExceptionHelper } from '@microsoft/agents-activity'
import { trace, debug } from '@microsoft/agents-telemetry'
import { AuthProvider } from '../../../auth'
import { AuthorizationTraceDefinitions } from '../../../observability'
import { Errors } from '../../../errorHelper'

const logger = debug('agents:authorization:azurebot')

const DEFAULT_SIGN_IN_ATTEMPTS = 2

enum Category {
  SIGNIN = 'signin',
  UNKNOWN = 'unknown',
}

/**
 * Active handler manager information.
 */
interface AzureBotActiveHandler extends ActiveAuthorizationHandler {
  /**
   * The number of attempts left for the handler to process in case of failure.
   */
  attemptsLeft: number
  /**
   * The current category of the handler.
   */
  category?: Category
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
export interface AzureBotAuthorizationOptions {
  /**
   * The type of authorization handler.
   * This property is optional and should not be set when configuring this handler.
   * It is included here for completeness and type safety.
   */
  type?: 'AzureBotUserAuthorization' | undefined
  /**
   * Connection name for the auth provider.
   */
  azureBotOAuthConnectionName?: string,
  /**
   * Title to display on auth cards/UI.
   */
  title?: string,
  /**
   * Text to display on auth cards/UI.
   */
  text?: string,
  /**
   * Maximum number of attempts for entering the magic code. Defaults to 2.
   */
  invalidSignInRetryMax?: number
  /**
   * Message displayed when an invalid code is entered.
   * Use `{code}` as a placeholder to display the entered code.
   * Defaults to: 'The code entered is invalid. Please sign-in again to continue.'
   */
  invalidSignInRetryMessage?: string
  /**
   * Message displayed when the entered code format is invalid.
   * Use `{attemptsLeft}` as a placeholder to display the number of attempts left.
   * Defaults to: 'Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**{attemptsLeft} attempt(s) left...**'
   */
  invalidSignInRetryMessageFormat?: string
  /**
   * Message displayed when the maximum number of attempts is exceeded.
   * Use `{maxAttempts}` as a placeholder to display the maximum number of attempts.
   * Defaults to: 'You have exceeded the maximum number of sign-in attempts ({maxAttempts}).'
   */
  invalidSignInRetryMaxExceededMessage?: string
  /**
   * Connection name to use for on-behalf-of token acquisition.
   */
  oboConnectionName?: string
  /**
   * Scopes to request for on-behalf-of token acquisition.
   * @remarks When set via environment variable, use comma or space-separated values (e.g. `scope1,scope2` or `scope1 scope2`).
   */
  oboScopes?: string[]
  /**
   * Option to enable SSO when authenticating using Azure Active Directory (AAD). Defaults to true.
   */
  enableSso?: boolean
}

/**
 * Settings for configuring the AzureBot authorization handler.
 */
export interface AzureBotAuthorizationSettings extends AuthorizationHandlerSettings {}

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

/**
 * Default implementation of an authorization handler using Azure Bot Service.
 */
export class AzureBotAuthorization implements AuthorizationHandler {
  private _onSuccess?: Parameters<AuthorizationHandler['onSuccess']>[0]
  private _onFailure?: Parameters<AuthorizationHandler['onFailure']>[0]

  /**
   * Creates an instance of the AzureBotAuthorization.
   * @param id The unique identifier for the handler.
   * @param options The settings for the handler (must be fully resolved).
   * @param settings The authorization handler settings.
   */
  constructor (public readonly id: string, private options: AzureBotAuthorizationOptions, private settings: AzureBotAuthorizationSettings) {
    if (!this.settings.storage) {
      throw ExceptionHelper.generateException(Error, Errors.StorageOptionNotAvailable)
    }

    if (!this.settings.connections) {
      throw ExceptionHelper.generateException(Error, Errors.ConnectionsOptionNotAvailable)
    }

    if (!options.azureBotOAuthConnectionName) {
      throw ExceptionHelper.generateException(Error, Errors.AzureBotOAuthConnectionNameRequired)
    }
  }

  readonly type = 'azurebot'

  /**
   * The OBO scopes configured for this handler.
   */
  get scopes (): string[] | undefined {
    return this.options.oboScopes
  }

  /**
   * Maximum number of attempts for magic code entry.
   */
  private get maxAttempts (): number {
    const attempts = this.options.invalidSignInRetryMax
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
   * @param options Optional options for token acquisition, including connection and scopes for on-behalf-of flow.
   * @returns The token response containing the token or undefined if not available.
   */
  async token (context: TurnContext, options?: AuthorizationHandlerTokenOptions): Promise<TokenResponse> {
    return trace(AuthorizationTraceDefinitions.azureBotToken, async ({ record }) => {
      let { token } = this.getContext(context)
      const traceContext = { connection: this.options.azureBotOAuthConnectionName, scopes: [] }

      try {
        if (!token?.trim()) {
          const { activity } = context

          const userTokenClient = await this.getUserTokenClient(context)
          // Using getTokenOrSignInResource instead of getUserToken to avoid HTTP 404 errors.
          const { tokenResponse } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this.options.azureBotOAuthConnectionName!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, '')
          token = tokenResponse?.token
        }

        if (!token?.trim()) {
          return { token: undefined }
        }

        return await this.handleOBO(token, options, traceContext)
      } finally {
        record({
          handlerId: this.id,
          connectionName: traceContext.connection ?? 'unknown',
          authFlow: traceContext.scopes && traceContext.scopes.length > 0 ? 'obo' : '',
          authScopes: traceContext.scopes ?? []
        })
        if (traceContext.scopes && traceContext.scopes.length > 0) {
          record({ authFlow: 'obo', authScopes: traceContext.scopes })
        }
      }
    })
  }

  /**
   * Signs out the user from the service.
   * @param context The turn context.
   * @returns True if the signout was successful, false otherwise.
   */
  async signout (context: TurnContext): Promise<boolean> {
    return trace(AuthorizationTraceDefinitions.azureBotSignout, async ({ record }) => {
      const user = context.activity.from?.id
      const channel = context.activity.channelId
      const connection = this.options.azureBotOAuthConnectionName!

      record({ handlerId: this.id, connectionName: connection, channelId: channel ?? 'unknown' })

      if (!channel || !user) {
        throw ExceptionHelper.generateException(Error, Errors.ChannelIdAndFromIdRequiredForSignout)
      }

      logger.debug(this.prefix(`Signing out User '${user}' from => Channel: '${channel}', Connection: '${connection}'`), context.activity)
      const userTokenClient = await this.getUserTokenClient(context)
      await userTokenClient.signOut(user, connection, channel)
      return true
    })
  }

  /**
   * Initiates the sign-in process for the handler.
   * @param context The turn context.
   * @param active Optional active handler data.
   * @returns The status of the sign-in attempt.
   */
  async signin (context: TurnContext, active?: AzureBotActiveHandler): Promise<AuthorizationHandlerStatus> {
    return trace(AuthorizationTraceDefinitions.azureBotSignin, async ({ record, actions }) => {
      const reason = { message: '' }
      let status: AuthorizationHandlerStatus | undefined
      const { activity } = context
      const [category] = activity.name?.split('/') ?? [Category.UNKNOWN]

      const storage = new HandlerStorage<AzureBotActiveHandler>(this.settings.storage, context)

      try {
        if (!active) {
          status = await this.setToken(storage, context, undefined, undefined, reason)
          return status
        }

        logger.debug(this.prefix('Sign-in active session detected'), active.activity)

        if (active.attemptsLeft <= 0) {
          reason.message = 'Maximum sign-in attempts exceeded'
          logger.warn(this.prefix(reason.message), activity)
          await context.sendActivity(MessageFactory.text(this.messages.maxAttemptsExceeded(this.maxAttempts)))
          status = AuthorizationHandlerStatus.REJECTED
          return status
        }

        if (category === Category.SIGNIN) {
          await storage.write({ ...active, category })
          status = await this.handleSignInActivities(context, reason)
          if (status !== AuthorizationHandlerStatus.IGNORED) {
            return status
          }
        } else if (active.category === Category.SIGNIN && activity.channelId === Channels.Msteams) {
          // Specific to MS Teams, M365 does not send signin/verifyState when user consent is required.
          // This is only for safety in case of unexpected behaviors during the MS Teams sign-in process,
          // e.g., user interrupts the flow by clicking the Consent Cancel button.
          reason.message = 'The incoming activity will be revalidated due to a change in the sign-in flow'
          logger.warn(this.prefix(reason.message), activity)
          status = AuthorizationHandlerStatus.REVALIDATE
          return status
        }

        const verification = await this.codeVerification(storage, context, active, reason)
        status = verification.status
        if (status !== AuthorizationHandlerStatus.APPROVED) {
          return status
        }

        try {
          const result = await this.setToken(storage, context, active, verification.code, reason)
          status = result
          if (result !== AuthorizationHandlerStatus.APPROVED) {
            await sendInvokeResponse(context, { status: 404 })
            return result
          }

          await sendInvokeResponse(context, { status: 200 })
          await this._onSuccess?.(context)
          return result
        } catch (error) {
          await sendInvokeResponse(context, { status: 500 })
          if (error instanceof Error) {
            error.message = this.prefix(error.message)
          }
          throw error
        }
      } finally {
        await actions.link(storage)
        record({
          handlerId: this.id,
          status: status ?? 'unknown',
          statusReason: reason.message,
          connectionName: this.options.azureBotOAuthConnectionName ?? 'unknown'
        })
      }
    })
  }

  /**
   * Handles on-behalf-of token acquisition.
   */
  private async handleOBO (token: string, options?: AuthorizationHandlerTokenOptions, traceContext: { connection?: string, scopes?: string[] } = {}): Promise<TokenResponse> {
    const oboConnection = options?.connection ?? this.options.oboConnectionName
    const oboScopes = options?.scopes && options.scopes.length > 0 ? options.scopes : this.options.oboScopes

    if (!oboScopes || oboScopes.length === 0) {
      traceContext.connection = this.options.azureBotOAuthConnectionName
      traceContext.scopes = undefined
      return { token }
    }

    if (!this.isExchangeable(token)) {
      throw ExceptionHelper.generateException(Error, Errors.AzureBotConnectionTokenNotExchangeable, undefined, { connectionName: this.options.azureBotOAuthConnectionName! })
    }

    let provider: AuthProvider | undefined
    try {
      provider = oboConnection ? this.settings.connections.getConnection(oboConnection) : this.settings.connections.getDefaultConnection()
      const newToken = await provider.acquireTokenOnBehalfOf(oboScopes, token)
      logger.debug(this.prefix('Successfully acquired on-behalf-of token'), { connection: oboConnection, scopes: oboScopes })
      return { token: newToken }
    } catch (error) {
      logger.error(this.prefix('Failed to exchange on-behalf-of token'), { connection: oboConnection, scopes: oboScopes }, error)
      return { token: undefined }
    } finally {
      traceContext.connection = provider?.connectionSettings?.connectionName ?? oboConnection
      traceContext.scopes = oboScopes
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
  private async setToken (storage: HandlerStorage<AzureBotActiveHandler>, context: TurnContext, active?: AzureBotActiveHandler, code?: string, reason: { message: string } = { message: '' }): Promise<AuthorizationHandlerStatus> {
    const { activity } = context

    const userTokenClient = await this.getUserTokenClient(context)
    const { tokenResponse, signInResource } = await userTokenClient.getTokenOrSignInResource(activity.from?.id!, this.options.azureBotOAuthConnectionName!, activity.channelId!, activity.getConversationReference(), activity.relatesTo!, code ?? '')

    if (!tokenResponse && active && code) {
      reason.message = 'Invalid code entered. Restarting sign-in flow'
      logger.warn(this.prefix(reason.message), activity)
      await context.sendActivity(MessageFactory.text(this.messages.invalidCode(code)))
      return AuthorizationHandlerStatus.REJECTED
    }

    if (!tokenResponse) {
      reason.message = 'Cannot find token. Sending sign-in card'
      logger.debug(this.prefix(reason.message), activity)

      const oCard = CardFactory.oauthCard(this.options.azureBotOAuthConnectionName!, this.options.title!, this.options.text!, signInResource, this.options.enableSso)
      await context.sendActivity(MessageFactory.attachment(oCard))
      await storage.write({ activity, id: this.id, ...(active ?? {}), attemptsLeft: this.maxAttempts })
      return AuthorizationHandlerStatus.PENDING
    }

    reason.message = 'Successfully acquired token'
    logger.debug(this.prefix(reason.message), activity)
    this.setContext(context, { token: tokenResponse.token })
    return AuthorizationHandlerStatus.APPROVED
  }

  /**
   * Handles sign-in related activities.
   */
  private async handleSignInActivities (context: TurnContext, reason: { message: string }): Promise<AuthorizationHandlerStatus> {
    const { activity } = context

    // Ignore signin/verifyState here (handled in codeVerification).
    if (activity.name === 'signin/verifyState') {
      return AuthorizationHandlerStatus.IGNORED
    }

    const userTokenClient = await this.getUserTokenClient(context)

    if (activity.name === 'signin/tokenExchange') {
      const tokenExchangeInvokeRequest = activity.value as TokenExchangeInvokeRequest
      const tokenExchangeRequest: TokenExchangeRequest = { token: tokenExchangeInvokeRequest?.token }

      if (!tokenExchangeRequest?.token) {
        reason.message = 'The Agent received an InvokeActivity that is missing a TokenExchangeInvokeRequest value. This is required to be sent with the InvokeActivity.'
        await sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 400,
          body: { connectionName: this.options.azureBotOAuthConnectionName!, failureDetail: reason.message }
        })
        logger.error(this.prefix(reason.message))
        await this._onFailure?.(context, reason.message)
        return AuthorizationHandlerStatus.REJECTED
      }

      if (tokenExchangeInvokeRequest.connectionName !== this.options.azureBotOAuthConnectionName) {
        reason.message = `The Agent received an InvokeActivity with a TokenExchangeInvokeRequest for a different connection name ('${tokenExchangeInvokeRequest.connectionName}') than expected ('${this.options.azureBotOAuthConnectionName}').`
        await sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 400,
          body: { id: tokenExchangeInvokeRequest.id, connectionName: this.options.azureBotOAuthConnectionName!, failureDetail: reason.message }
        })
        logger.error(this.prefix(reason.message))
        await this._onFailure?.(context, reason.message)
        return AuthorizationHandlerStatus.REJECTED
      }

      const { token } = await userTokenClient.exchangeTokenAsync(activity.from?.id!, this.options.azureBotOAuthConnectionName!, activity.channelId!, tokenExchangeRequest)
      if (!token) {
        reason.message = 'The MS Teams token service didn\'t send back the exchanged token. Waiting for MS Teams to send another signin/tokenExchange request. After multiple failed attempts, the user will be asked to enter the magic code.'
        await sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
          status: 412,
          body: { id: tokenExchangeInvokeRequest.id, connectionName: this.options.azureBotOAuthConnectionName, failureDetail: reason.message }
        })
        logger.debug(this.prefix(reason.message))
        return AuthorizationHandlerStatus.PENDING
      }

      await sendInvokeResponse<TokenExchangeInvokeResponse>(context, {
        status: 200,
        body: { id: tokenExchangeInvokeRequest.id, connectionName: this.options.azureBotOAuthConnectionName! }
      })
      reason.message = 'Successfully exchanged token'
      logger.debug(this.prefix(reason.message))
      this.setContext(context, { token })
      await this._onSuccess?.(context)
      return AuthorizationHandlerStatus.APPROVED
    }

    if (activity.name === 'signin/failure') {
      await sendInvokeResponse(context, { status: 200 })
      reason.message = 'Failed to sign-in'
      const value = activity.value as SignInFailureValue
      logger.error(this.prefix(reason.message), value, activity)
      if (this._onFailure) {
        await this._onFailure(context, value.message || reason.message)
      } else {
        await context.sendActivity(MessageFactory.text(`${reason.message}. Please try again.`))
      }
      return AuthorizationHandlerStatus.REJECTED
    }

    reason.message = `Unknown sign-in activity name: ${activity.name}`
    logger.error(this.prefix(reason.message), activity)
    return AuthorizationHandlerStatus.REJECTED
  }

  /**
   * Verifies the magic code provided by the user.
   */
  private async codeVerification (storage: HandlerStorage<AzureBotActiveHandler>, context: TurnContext, active?: AzureBotActiveHandler, reason: { message: string } = { message: '' }): Promise<{ status: AuthorizationHandlerStatus, code?: string }> {
    if (!active) {
      logger.debug(this.prefix('No active session found. Skipping code verification.'), context.activity)
      return { status: AuthorizationHandlerStatus.IGNORED }
    }

    const { activity } = context
    let state: string | undefined = activity.text

    if (activity.name === 'signin/verifyState') {
      logger.debug(this.prefix('Getting code from activity.value'), activity)
      const { state: teamsState } = activity.value as TokenVerifyState
      state = teamsState
    }

    if (state === 'CancelledByUser') {
      await sendInvokeResponse(context, { status: 200 })
      reason.message = 'Sign-in process was cancelled by the user'
      logger.warn(this.prefix(reason.message), activity)
      return { status: AuthorizationHandlerStatus.REJECTED }
    }

    if (!state?.match(/^\d{6}$/)) {
      reason.message = `Invalid magic code entered. Attempts left: ${active.attemptsLeft}`
      logger.warn(this.prefix(reason.message), activity)
      await context.sendActivity(MessageFactory.text(this.messages.invalidCodeFormat(active.attemptsLeft)))
      await storage.write({ ...active, attemptsLeft: active.attemptsLeft - 1 })
      return { status: AuthorizationHandlerStatus.PENDING }
    }

    await sendInvokeResponse(context, { status: 200 })
    reason.message = 'Code verification successful'
    logger.debug(this.prefix(reason.message), activity)
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
   * Gets the user token client from the turn context.
   */
  private async getUserTokenClient (context: TurnContext): Promise<UserTokenClient> {
    const userTokenClient = context.turnState.get<UserTokenClient>(context.adapter.UserTokenClientKey)
    if (!userTokenClient) {
      throw ExceptionHelper.generateException(Error, Errors.UserTokenClientNotAvailable)
    }
    return userTokenClient
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
      const message = this.options.invalidSignInRetryMessage ?? 'Invalid **{code}** code entered. Please try again with a new sign-in request.'
      return message.replaceAll('{code}', code)
    },
    invalidCodeFormat: (attemptsLeft: number) => {
      const message = this.options.invalidSignInRetryMessageFormat ?? 'Please enter a valid **6-digit** code format (_e.g. 123456_).\r\n**{attemptsLeft} attempt(s) left...**'
      return message.replaceAll('{attemptsLeft}', attemptsLeft.toString())
    },
    maxAttemptsExceeded: (maxAttempts: number) => {
      const message = this.options.invalidSignInRetryMaxExceededMessage ?? 'You have exceeded the maximum number of sign-in attempts ({maxAttempts}). Please try again with a new sign-in request.'
      return message.replaceAll('{maxAttempts}', maxAttempts.toString())
    },
  }
}
