// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { debug } from './../logger'
import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  CardFactory,
  AgentStatePropertyAccessor,
  UserState,
  TurnContext,
  MessageFactory,
  SigningResource,
  TokenExchangeRequest,
  UserTokenClient
} from '../'
import { TokenRequestStatus, TokenResponse } from './tokenResponse'

const logger = debug('agents:oauth-flow')

export class FlowState {
  public flowStarted: boolean = false
  public flowExpires: number = 0
}

interface TokenVerifyState {
  state: string
}
/**
 * Manages the OAuth flow for Teams.
 */
export class OAuthFlow {
  userTokenClient?: UserTokenClient
  state: FlowState | null
  flowStateAccessor: AgentStatePropertyAccessor<FlowState | null>
  tokenExchangeId: string | null = null
  absOauthConnectionName: string
  /**
   * Creates a new instance of OAuthFlow.
   * @param userState The user state.
   */
  constructor (userState: UserState, absOauthConnectionName: string, tokenClient?: UserTokenClient) {
    this.state = null
    this.flowStateAccessor = userState.createProperty('flowState')
    this.absOauthConnectionName = absOauthConnectionName
    this.userTokenClient = tokenClient
  }

  public async getUserToken (context: TurnContext): Promise<TokenResponse> {
    await this.initializeTokenClient(context)
    return await this.userTokenClient?.getUserToken(this.absOauthConnectionName, context.activity.channelId!, context.activity.from?.id!)!
  }

  /**
   * Begins the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async beginFlow (context: TurnContext): Promise<TokenResponse> {
    logger.info('Starting OAuth flow')
    this.state = await this.getUserState(context)

    const authConfig = context.adapter.authConfig
    if (this.absOauthConnectionName === '') {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    await this.initializeTokenClient(context)

    const tokenResponse = await this.userTokenClient!.getUserToken(this.absOauthConnectionName, context.activity.channelId!, context.activity.from?.id!)
    if (tokenResponse?.status === TokenRequestStatus.Success) {
      this.state.flowStarted = false
      this.state.flowExpires = 0
      await this.flowStateAccessor.set(context, this.state)
      logger.info('User token retrieved successfully from service')
      return tokenResponse
    }

    const signingResource: SigningResource = await this.userTokenClient!.getSignInResource(authConfig.clientId!, this.absOauthConnectionName, context.activity)
    const oCard: Attachment = CardFactory.oauthCard(this.absOauthConnectionName, 'Sign in', 'login', signingResource)
    const cardActivity : Activity = MessageFactory.attachment(oCard)
    await context.sendActivity(cardActivity)
    this.state.flowStarted = true
    this.state.flowExpires = Date.now() + 30000
    await this.flowStateAccessor.set(context, this.state)
    logger.info('OAuth begin flow completed, waiting for user to sign in')
    return {
      token: undefined,
      status: TokenRequestStatus.InProgress
    }
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
    if (this.userTokenClient === undefined) {
      const scope = 'https://api.botframework.com'
      const accessToken = await context.adapter.authProvider.getAccessToken(context.adapter.authConfig, scope)
      this.userTokenClient = new UserTokenClient(accessToken)
    }
  }
}
