// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { debug } from '@microsoft/agents-activity/logger'
import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  CardFactory,
  TurnContext,
  Storage,
  MessageFactory
} from '../'
import { UserTokenClient } from './userTokenClient'
import { TokenExchangeRequest, TokenResponse } from './userTokenClient.types'
import jwt, { JwtPayload } from 'jsonwebtoken'

const logger = debug('agents:oauth-flow')

/**
 * Represents the state of the OAuth flow.
 * @interface FlowState
 */
export interface FlowState {
  /** Indicates whether the OAuth flow has been started */
  flowStarted: boolean | undefined,
  /** Timestamp when the OAuth flow expires (in milliseconds since epoch) */
  flowExpires: number | undefined,
  /** The absolute OAuth connection name used for the flow, null if not set */
  absOauthConnectionName: string
  /** Optional activity to continue the flow with, used for multi-turn scenarios */
  continuationActivity?: Activity | null

  eTag?: string // Optional ETag for optimistic concurrency control
}

interface TokenVerifyState {
  state: string
}

interface CachedToken {
  token: TokenResponse
  expiresAt: number
}

/**
 * Manages the OAuth flow
 */
export class OAuthFlow {
  /**
   * The user token client used for managing user tokens.
   */
  userTokenClient: UserTokenClient

  /**
   * The current state of the OAuth flow.
   */
  state: FlowState

  /**
   * The ID of the token exchange request, used to deduplicate requests.
   */
  tokenExchangeId: string | null = null

  /**
   * In-memory cache for tokens with expiration.
   */
  private tokenCache: Map<string, CachedToken> = new Map()

  /**
   * The name of the OAuth connection.
   */
  absOauthConnectionName: string

  /**
   * The title of the OAuth card.
   */
  cardTitle: string = 'Sign in'

  /**
   * The text of the OAuth card.
   */
  cardText: string = 'login'

  /**
   * Creates a new instance of OAuthFlow.
   * @param storage The storage provider for persisting flow state.
   * @param absOauthConnectionName The absolute OAuth connection name.
   * @param tokenClient Optional user token client. If not provided, will be initialized automatically.
   * @param cardTitle Optional title for the OAuth card. Defaults to 'Sign in'.
   * @param cardText Optional text for the OAuth card. Defaults to 'login'.
   */
  constructor (private storage: Storage, absOauthConnectionName: string, tokenClient: UserTokenClient, cardTitle?: string, cardText?: string) {
    this.state = { flowStarted: undefined, flowExpires: undefined, absOauthConnectionName }
    this.absOauthConnectionName = absOauthConnectionName
    this.userTokenClient = tokenClient
    this.cardTitle = cardTitle ?? this.cardTitle
    this.cardText = cardText ?? this.cardText
  }

  /**
   * Retrieves the user token from the user token service with in-memory caching for 10 minutes.
   * @param context The turn context containing the activity information.
   * @returns A promise that resolves to the user token response.
   * @throws Will throw an error if the channelId or from properties are not set in the activity.
   */
  public async getUserToken (context: TurnContext): Promise<TokenResponse> {
    const activity = context.activity

    if (!activity.channelId || !activity.from || !activity.from.id) {
      throw new Error('UserTokenService requires channelId and from to be set')
    }

    const cacheKey = this.getCacheKey(context)

    const cachedEntry = this.tokenCache.get(cacheKey)
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
      logger.info(`Returning cached token for user with cache key: ${cacheKey}`)
      return cachedEntry.token
    }

    logger.info('Get token from user token service')
    await this.refreshToken(context)
    const tokenResponse = await this.userTokenClient.getUserToken(this.absOauthConnectionName, activity.channelId, activity.from.id)

    // Cache the token if it's valid (has a token value)
    if (tokenResponse && tokenResponse.token) {
      const cacheExpiry = Date.now() + (10 * 60 * 1000) // 10 minutes from now
      this.tokenCache.set(cacheKey, {
        token: tokenResponse,
        expiresAt: cacheExpiry
      })
      logger.info('Token cached for 10 minutes')
    }

    return tokenResponse
  }

  /**
   * Begins the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token if available, or undefined if OAuth flow needs to be started.
   */
  public async beginFlow (context: TurnContext): Promise<TokenResponse | undefined> {
    this.state = await this.getFlowState(context)
    if (this.absOauthConnectionName === '') {
      throw new Error('connectionName is not set')
    }
    logger.info('Starting OAuth flow for connectionName:', this.absOauthConnectionName)
    await this.refreshToken(context)

    const act = context.activity

    // Check cache first before starting OAuth flow
    if (act.channelId && act.from && act.from.id) {
      const cacheKey = this.getCacheKey(context)
      const cachedEntry = this.tokenCache.get(cacheKey)
      if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
        logger.info(`Returning cached token for user in beginFlow with cache key: ${cacheKey}`)
        return cachedEntry.token
      }
    }

    const output = await this.userTokenClient.getTokenOrSignInResource(act.from?.id!, this.absOauthConnectionName, act.channelId!, act.getConversationReference(), act.relatesTo!, undefined!)
    if (output && output.tokenResponse) {
      // Cache the token if it's valid
      if (act.channelId && act.from && act.from.id) {
        const cacheKey = this.getCacheKey(context)
        const cacheExpiry = Date.now() + (10 * 60 * 1000) // 10 minutes from now
        this.tokenCache.set(cacheKey, {
          token: output.tokenResponse,
          expiresAt: cacheExpiry
        })
        logger.info('Token cached for 10 minutes in beginFlow')
        this.state = { flowStarted: false, flowExpires: 0, absOauthConnectionName: this.absOauthConnectionName }
      }
      logger.info('Token retrieved successfully')
      return output.tokenResponse
    }
    const oCard: Attachment = CardFactory.oauthCard(this.absOauthConnectionName, this.cardTitle, this.cardText, output.signInResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    this.state = { flowStarted: true, flowExpires: Date.now() + 60 * 5 * 1000, absOauthConnectionName: this.absOauthConnectionName }
    await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
    logger.info('OAuth card sent, flow started')
    return undefined
  }

  /**
   * Continues the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token response.
   */
  public async continueFlow (context: TurnContext): Promise<TokenResponse> {
    this.state = await this.getFlowState(context)
    await this.refreshToken(context)
    if (this.state?.flowExpires !== 0 && Date.now() > this.state?.flowExpires!) {
      logger.warn('Flow expired')
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
      this.state!.flowStarted = false
      return { token: undefined }
    }
    const contFlowActivity = context.activity
    if (contFlowActivity.type === ActivityTypes.Message) {
      const magicCode = contFlowActivity.text as string
      if (magicCode.match(/^\d{6}$/)) {
        const result = await this.userTokenClient?.getUserToken(this.absOauthConnectionName, contFlowActivity.channelId!, contFlowActivity.from?.id!, magicCode)!
        if (result && result.token) {
          // Cache the token if it's valid
          if (contFlowActivity.channelId && contFlowActivity.from && contFlowActivity.from.id) {
            const cacheKey = this.getCacheKey(context)
            const cacheExpiry = Date.now() + (10 * 60 * 1000) // 10 minutes from now
            this.tokenCache.set(cacheKey, {
              token: result,
              expiresAt: cacheExpiry
            })
            logger.info('Token cached for 10 minutes in continueFlow (magic code)')
          }

          await this.storage.delete([this.getFlowStateKey(context)])
          logger.info('Token retrieved successfully')
          return result
        } else {
          // await context.sendActivity(MessageFactory.text('Invalid code. Please try again.'))
          logger.warn('Invalid magic code provided')
          this.state = { flowStarted: true, flowExpires: Date.now() + 30000, absOauthConnectionName: this.absOauthConnectionName }
          await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
          return { token: undefined }
        }
      } else {
        logger.warn('Invalid magic code format')
        await context.sendActivity(MessageFactory.text('Invalid code format. Please enter a 6-digit code.'))
        return { token: undefined }
      }
    }

    if (contFlowActivity.type === ActivityTypes.Invoke && contFlowActivity.name === 'signin/verifyState') {
      logger.info('Continuing OAuth flow with verifyState')
      const tokenVerifyState = contFlowActivity.value as TokenVerifyState
      const magicCode = tokenVerifyState.state
      const result = await this.userTokenClient?.getUserToken(this.absOauthConnectionName, contFlowActivity.channelId!, contFlowActivity.from?.id!, magicCode)!
      // Cache the token if it's valid
      if (result && result.token && contFlowActivity.channelId && contFlowActivity.from && contFlowActivity.from.id) {
        const cacheKey = this.getCacheKey(context)
        const cacheExpiry = Date.now() + (10 * 60 * 1000) // 10 minutes from now
        this.tokenCache.set(cacheKey, {
          token: result,
          expiresAt: cacheExpiry
        })
        logger.info('Token cached for 10 minutes in continueFlow (verifyState)')
      }
      return result
    }

    if (contFlowActivity.type === ActivityTypes.Invoke && contFlowActivity.name === 'signin/tokenExchange') {
      logger.info('Continuing OAuth flow with tokenExchange')
      const tokenExchangeRequest = contFlowActivity.value as TokenExchangeRequest
      if (this.tokenExchangeId === tokenExchangeRequest.id) { // dedupe
        logger.debug('Token exchange request already processed, skipping')
        return { token: undefined }
      }
      this.tokenExchangeId = tokenExchangeRequest.id!
      const userTokenResp = await this.userTokenClient?.exchangeTokenAsync(contFlowActivity.from?.id!, this.absOauthConnectionName, contFlowActivity.channelId!, tokenExchangeRequest)
      if (userTokenResp && userTokenResp.token) {
        // Cache the token if it's valid
        if (contFlowActivity.channelId && contFlowActivity.from && contFlowActivity.from.id) {
          const cacheKey = this.getCacheKey(context)
          const cacheExpiry = Date.now() + (10 * 60 * 1000) // 10 minutes from now
          this.tokenCache.set(cacheKey, {
            token: userTokenResp,
            expiresAt: cacheExpiry
          })
          logger.info('Token cached for 10 minutes in continueFlow (tokenExchange)')
        }

        logger.info('Token exchanged')
        this.state!.flowStarted = false
        await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
        return userTokenResp
      } else {
        logger.warn('Token exchange failed')
        this.state!.flowStarted = true
        return { token: undefined }
      }
    }
    return { token: undefined }
  }

  /**
   * Signs the user out.
   * @param context The turn context.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  public async signOut (context: TurnContext): Promise<void> {
    await this.refreshToken(context)

    // Clear cached token for this user
    const activity = context.activity
    if (activity.channelId && activity.from && activity.from.id) {
      const cacheKey = this.getCacheKey(context)
      this.tokenCache.delete(cacheKey)
      logger.info('Cached token cleared for user')
    }

    await this.userTokenClient?.signOut(context.activity.from?.id as string, this.absOauthConnectionName, context.activity.channelId as string)
    this.state = { flowStarted: false, flowExpires: 0, absOauthConnectionName: this.absOauthConnectionName }
    await this.storage.delete([this.getFlowStateKey(context)])
    logger.info('User signed out successfully from connection:', this.absOauthConnectionName)
  }

  /**
   * Gets the user state for the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the flow state.
   */
  public async getFlowState (context: TurnContext) : Promise<FlowState> {
    const key = this.getFlowStateKey(context)
    const data = await this.storage.read([key])
    const flowState: FlowState = data[key] // ?? { flowStarted: false, flowExpires: 0 }
    return flowState
  }

  /**
   * Sets the flow state for the OAuth flow.
   * @param context The turn context.
   * @param flowState The flow state to set.
   * @returns A promise that resolves when the flow state is set.
   */
  public async setFlowState (context: TurnContext, flowState: FlowState) : Promise<void> {
    const key = this.getFlowStateKey(context)
    await this.storage.write({ [key]: flowState })
    this.state = flowState
    logger.debug(`Flow state set: ${JSON.stringify(flowState)}`)
  }

  /**
   * Initializes the user token client if not already initialized.
   * @param context The turn context used to get authentication credentials.
   */
  private async refreshToken (context: TurnContext) {
    const cachedToken = this.tokenCache.get('__access_token__')
    if (!cachedToken || Date.now() > cachedToken.expiresAt) {
      const accessToken = await context.adapter.authProvider.getAccessToken(context.adapter.authConfig, 'https://api.botframework.com')
      const decodedToken = jwt.decode(accessToken) as JwtPayload
      this.tokenCache.set('__access_token__', {
        token: { token: accessToken },
        expiresAt: decodedToken?.exp ? decodedToken.exp * 1000 - 1000 : Date.now() + 10 * 60 * 1000
      })
      this.userTokenClient.updateAuthToken(accessToken)
    }
  }

  /**
   * Generates a cache key for storing user tokens.
   * @param context The turn context containing activity information.
   * @returns The cache key string in format: channelId_userId_connectionName.
   * @throws Will throw an error if required activity properties are missing.
   */
  private getCacheKey (context: TurnContext): string {
    const activity = context.activity
    if (!activity.channelId || !activity.from || !activity.from.id) {
      throw new Error('ChannelId and from.id must be set in the activity for cache key generation')
    }
    return `${activity.channelId}_${activity.from.id}_${this.absOauthConnectionName}`
  }

  /**
   * Generates a storage key for persisting OAuth flow state.
   * @param context The turn context containing activity information.
   * @returns The storage key string in format: oauth/channelId/conversationId/userId/flowState.
   * @throws Will throw an error if required activity properties are missing.
   */
  private getFlowStateKey (context: TurnContext): string {
    const channelId = context.activity.channelId
    const conversationId = context.activity.conversation?.id
    const userId = context.activity.from?.id
    if (!channelId || !conversationId || !userId) {
      throw new Error('ChannelId, conversationId, and userId must be set in the activity')
    }
    return `oauth/${channelId}/${userId}/${this.absOauthConnectionName}/flowState`
  }
}
