// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { debug } from './../logger'
import { ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  CardFactory,
  AgentStatePropertyAccessor,
  UserState,
  TurnContext,
  MessageFactory,
} from '../'
import { UserTokenClient } from './userTokenClient'
import { TokenExchangeRequest, TokenRequestStatus, TokenResponse } from './userTokenClient.types'

const logger = debug('agents:oauth-flow')

export class FlowState {
  public flowStarted: boolean = false
  public flowExpires: number = 0
}

interface TokenVerifyState {
  state: string
}
/**
 * Manages the OAuth flow
 */
export class OAuthFlow {
  userTokenClient: UserTokenClient
  state: FlowState | null
  flowStateAccessor: AgentStatePropertyAccessor<FlowState | null>
  tokenExchangeId: string | null = null
  absOauthConnectionName: string
  cardTitle: string = 'Sign in'
  cardText: string = 'login'
  /**
   * Creates a new instance of OAuthFlow.
   * @param userState The user state.
   */
  constructor (userState: UserState, absOauthConnectionName: string, tokenClient?: UserTokenClient, cardTitle?: string, cardText?: string) {
    this.state = new FlowState()
    this.flowStateAccessor = userState.createProperty('flowState')
    this.absOauthConnectionName = absOauthConnectionName
    this.userTokenClient = tokenClient ?? null!
    this.cardTitle = cardTitle ?? this.cardTitle
    this.cardText = cardText ?? this.cardText
  }

  public async getUserToken (context: TurnContext): Promise<TokenResponse> {
    await this.initializeTokenClient(context)
    logger.info('Get token from user token service')
    const activity = context.activity
    if (activity.channelId && activity.from && activity.from.id) {
      return await this.userTokenClient.getUserToken(this.absOauthConnectionName, activity.channelId, activity.from.id)
    } else {
      throw new Error('UserTokenService requires channelId and from to be set')
    }
  }

  /**
   * Begins the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async beginFlow (context: TurnContext): Promise<TokenResponse> {
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
      await this.flowStateAccessor.set(context, this.state)
      return output.tokenResponse
    }
    const oCard: Attachment = CardFactory.oauthCard(this.absOauthConnectionName, this.cardTitle, this.cardText, output.signInResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    this.state.flowStarted = true
    this.state.flowExpires = Date.now() + 30000
    await this.flowStateAccessor.set(context, this.state)
    return undefined!
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
      this.state!.flowStarted = false
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
      return { status: TokenRequestStatus.Expired, token: undefined }
    }
    const contFlowActivity = context.activity
    if (contFlowActivity.type === ActivityTypes.Message) {
      const magicCode = contFlowActivity.text as string
      const result = await this.userTokenClient?.getUserToken(this.absOauthConnectionName, contFlowActivity.channelId!, contFlowActivity.from?.id!, magicCode)!
      return result
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
        return { status: TokenRequestStatus.InProgress, token: undefined }
      }
      this.tokenExchangeId = tokenExchangeRequest.id!
      const userTokenResp = await this.userTokenClient?.exchangeTokenAsync(contFlowActivity.from?.id!, this.absOauthConnectionName, contFlowActivity.channelId!, tokenExchangeRequest)
      if (userTokenResp?.status === TokenRequestStatus.Success) {
        logger.info('Token exchanged')
        this.state!.flowStarted = false
        await this.flowStateAccessor.set(context, this.state)
        return userTokenResp
      } else {
        logger.warn('Token exchange failed')
        this.state!.flowStarted = true
        return { status: TokenRequestStatus.Failed, token: undefined }
      }
    }
    return { status: TokenRequestStatus.Failed, token: undefined }
  }

  /**
   * Signs the user out.
   * @param context The turn context.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  public async signOut (context: TurnContext): Promise<void> {
    this.state = await this.getUserState(context)
    await this.initializeTokenClient(context)
    await this.userTokenClient?.signOut(context.activity.from?.id as string, this.absOauthConnectionName, context.activity.channelId as string)
    this.state!.flowExpires = 0
    await this.flowStateAccessor.set(context, this.state)
    logger.info('User signed out successfully')
  }

  /**
   * Gets the user state.
   * @param context The turn context.
   * @returns A promise that resolves to the user state.
   */
  private async getUserState (context: TurnContext) {
    let userProfile: FlowState | null = await this.flowStateAccessor.get(context, null)
    if (userProfile === null) {
      userProfile = new FlowState()
    }
    return userProfile
  }

  private async initializeTokenClient (context: TurnContext) {
    if (this.userTokenClient === undefined || this.userTokenClient === null) {
      const scope = 'https://api.botframework.com'
      const accessToken = await context.adapter.authProvider.getAccessToken(context.adapter.authConfig, scope)
      this.userTokenClient = new UserTokenClient(accessToken, context.adapter.authConfig.clientId!)
    }
  }
}
