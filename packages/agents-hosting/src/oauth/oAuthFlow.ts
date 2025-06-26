// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { debug } from './../logger'
import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  CardFactory,
  TurnContext,
  Storage,
  MessageFactory
} from '../'
import { UserTokenClient } from './userTokenClient'
import { TokenExchangeRequest, TokenResponse } from './userTokenClient.types'

const logger = debug('agents:oauth-flow')

/**
 * Represents the state of the OAuth flow.
 * @interface FlowState
 */
export interface FlowState {
  /** Indicates whether the OAuth flow has been started */
  flowStarted: boolean,
  /** Timestamp when the OAuth flow expires (in milliseconds since epoch) */
  flowExpires: number,
  /** The absolute OAuth connection name used for the flow, null if not set */
  absOauthConnectionName: string | null
  /** Optional activity to continue the flow with, used for multi-turn scenarios */
  continuationActivity?: Activity | null
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
   * @param userState The user state.
   */
  constructor (private storage: Storage, absOauthConnectionName: string, tokenClient?: UserTokenClient, cardTitle?: string, cardText?: string) {
    this.state = { flowExpires: 0, flowStarted: false, absOauthConnectionName: null }
    this.absOauthConnectionName = absOauthConnectionName
    this.userTokenClient = tokenClient ?? null!
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
    await this.initializeTokenClient(context)
    const activity = context.activity

    if (!activity.channelId || !activity.from || !activity.from.id) {
      throw new Error('UserTokenService requires channelId and from to be set')
    }

    const cacheKey = `${activity.channelId}_${activity.from.id}_${this.absOauthConnectionName}`

    const cachedEntry = this.tokenCache.get(cacheKey)
    if (cachedEntry && Date.now() < cachedEntry.expiresAt) {
      logger.info('Returning cached token for user')
      return cachedEntry.token
    }

    if (cachedEntry) {
      this.tokenCache.delete(cacheKey)
    }

    logger.info('Get token from user token service')
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
   * @returns A promise that resolves to the user token.
   */
  public async beginFlow (context: TurnContext): Promise<TokenResponse | undefined> {
    this.state = await this.getUserState(context)
    if (this.absOauthConnectionName === '') {
      throw new Error('connectionName is not set')
    }
    logger.info('Starting OAuth flow for connectionName:', this.absOauthConnectionName)
    await this.initializeTokenClient(context)

    const act = context.activity
    const output = await this.userTokenClient.getTokenOrSignInResource(act.from?.id!, this.absOauthConnectionName, act.channelId!, act.getConversationReference(), act.relatesTo!, undefined!)
    if (output && output.tokenResponse) {
      this.state.flowStarted = false
      this.state.flowExpires = 0
      this.state.absOauthConnectionName = this.absOauthConnectionName
      await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
      logger.info('Token retrieved successfully')
      return output.tokenResponse
    }
    const oCard: Attachment = CardFactory.oauthCard(this.absOauthConnectionName, this.cardTitle, this.cardText, output.signInResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    this.state.flowStarted = true
    this.state.flowExpires = Date.now() + 30000
    this.state.absOauthConnectionName = this.absOauthConnectionName
    await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
    logger.info('OAuth card sent, flow started')
    return undefined
  }

  /**
   * Continues the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async continueFlow (context: TurnContext): Promise<TokenResponse> {
    this.state = await this.getUserState(context)
    await this.initializeTokenClient(context)
    if (this.state?.flowExpires !== 0 && Date.now() > this.state!.flowExpires) {
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
          this.state!.flowStarted = false
          this.state!.flowExpires = 0
          this.state!.absOauthConnectionName = this.absOauthConnectionName
          await this.storage.write({ [this.getFlowStateKey(context)]: this.state })
          logger.info('Token retrieved successfully')
          return result
        } else {
          // await context.sendActivity(MessageFactory.text('Invalid code. Please try again.'))
          logger.warn('Invalid magic code provided')
          this.state!.flowStarted = true
          this.state!.flowExpires = Date.now() + 30000 // reset flow expiration
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
    this.state = await this.getUserState(context)
    await this.initializeTokenClient(context)

    // Clear cached token for this user
    const activity = context.activity
    if (activity.channelId && activity.from && activity.from.id) {
      const cacheKey = `${activity.channelId}_${activity.from.id}_${this.absOauthConnectionName}`
      this.tokenCache.delete(cacheKey)
      logger.info('Cached token cleared for user')
    }

    await this.userTokenClient?.signOut(context.activity.from?.id as string, this.absOauthConnectionName, context.activity.channelId as string)
    this.state!.flowExpires = 0
    this.storage.write({ [this.getFlowStateKey(context)]: this.state })
    logger.info('User signed out successfully from connection:', this.absOauthConnectionName)
  }

  /**
   * Gets the user state.
   * @param context The turn context.
   * @returns A promise that resolves to the user state.
   */
  private async getUserState (context: TurnContext) {
    const key = this.getFlowStateKey(context)
    const data = await this.storage.read([key])
    const userProfile: FlowState = data[key] ?? { flowStarted: false, flowExpires: 0 }
    return userProfile
  }

  private async initializeTokenClient (context: TurnContext) {
    if (this.userTokenClient === undefined || this.userTokenClient === null) {
      const scope = 'https://api.botframework.com'
      const accessToken = await context.adapter.authProvider.getAccessToken(context.adapter.authConfig, scope)
      this.userTokenClient = new UserTokenClient(accessToken, context.adapter.authConfig.clientId!)
    }
  }

  private getFlowStateKey (context: TurnContext): string {
    const channelId = context.activity.channelId
    const conversationId = context.activity.conversation?.id
    const userId = context.activity.from?.id
    if (!channelId || !conversationId || !userId) {
      throw new Error('ChannelId, conversationId, and userId must be set in the activity')
    }
    return `oauth/${channelId}/${conversationId}/${userId}/flowState`
  }
}
