// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { debug } from './../logger'
import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  CloudAdapter,
  CardFactory,
  AgentStatePropertyAccessor,
  UserState,
  TurnContext,
  MessageFactory,
  SigningResource,
  TokenExchangeRequest,
  UserTokenClient
} from '../'
import { TokenResponse } from './tokenResponse'

const logger = debug('agents:oauth-flow')

class FlowState {
  public flowStarted: boolean = false
  public userToken: string = ''
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

  /**
   * Creates a new instance of OAuthFlow.
   * @param userState The user state.
   */
  constructor (userState: UserState) {
    this.state = null
    this.flowStateAccessor = userState.createProperty('flowState')
  }

  /**
   * Begins the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async beginFlow (context: TurnContext): Promise<TokenResponse> {
    logger.info('Starting OAuth flow')
    this.state = await this.getUserState(context)

    if (this.state.userToken !== '') {
      logger.info('Token found in user state')
      return {
        channelId: context.activity.channelId!,
        connectionName: context.adapter.authConfig.connectionName!,
        token: this.state.userToken,
        expires: this.state.flowExpires
      }
    }

    const adapter = context.adapter as CloudAdapter
    const authConfig = context.adapter.authConfig
    if (authConfig.connectionName === undefined) {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new UserTokenClient(accessToken)

    const token = await this.userTokenClient.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!)
    if (token?.token) {
      this.state.userToken = token.token
      this.state.flowStarted = false
      this.state.flowExpires = 0
      await this.flowStateAccessor.set(context, this.state)
      logger.info('User token retrieved successfully from service')
      return {
        channelId: context.activity.channelId!,
        connectionName: context.adapter.authConfig.connectionName!,
        token: this.state.userToken,
        expires: this.state.flowExpires
      }
    }

    const signingResource: SigningResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
    const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName as string, 'Sign in', 'login', signingResource)
    const cardActivity : Activity = MessageFactory.attachment(oCard)
    await context.sendActivity(cardActivity)
    this.state.flowStarted = true
    this.state.flowExpires = Date.now() + 30000
    await this.flowStateAccessor.set(context, this.state)
    logger.info('OAuth begin flow completed, waiting for user to sign in')
    return {
      channelId: context.activity.channelId!,
      connectionName: context.adapter.authConfig.connectionName!,
      token: null,
      expires: this.state.flowExpires
    }
  }

  /**
   * Continues the OAuth flow.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async continueFlow (context: TurnContext): Promise<string | null> {
    if (this.state?.flowExpires !== 0 && Date.now() > this.state!.flowExpires) {
      logger.warn('Flow expired')
      this.state!.flowStarted = false
      this.state!.userToken = ''
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
      return null
    }
    this.state = await this.getUserState(context)
    const contFlowActivity = context.activity
    const authConfig = context.adapter.authConfig

    if (contFlowActivity.type === ActivityTypes.Message) {
      const magicCode = contFlowActivity.text as string
      const result = await this.userTokenClient?.getUserToken(authConfig.connectionName!, contFlowActivity.channelId!, contFlowActivity.from?.id!, magicCode)
      return result?.token
    }

    if (contFlowActivity.type === ActivityTypes.Invoke && contFlowActivity.name === 'signin/verifyState') {
      logger.info('Continuing OAuth flow with verifyState')
      const tokenVerifyState = contFlowActivity.value as TokenVerifyState
      const magicCode = tokenVerifyState.state
      const result = await this.userTokenClient?.getUserToken(authConfig.connectionName!, contFlowActivity.channelId!, contFlowActivity.from?.id!, magicCode)
      return result?.token
    }

    if (contFlowActivity.type === ActivityTypes.Invoke && contFlowActivity.name === 'signin/tokenExchange') {
      logger.info('Continuing OAuth flow with tokenExchange')
      const tokenExchangeRequest = contFlowActivity.value as TokenExchangeRequest
      // if (this.tokenExchangeId === tokenExchangeRequest.id) {
      //   return '' // dedupe
      // }
      this.tokenExchangeId = tokenExchangeRequest.id!
      const userTokenResp = await this.userTokenClient?.exchangeTokenAsync(contFlowActivity.from?.id!, authConfig.connectionName!, contFlowActivity.channelId!, tokenExchangeRequest)
      if (userTokenResp?.token) {
        logger.info('Token exchanged')
        this.state!.userToken = userTokenResp.token
        this.state!.flowStarted = false
        await context.sendActivity(MessageFactory.text('User signed in' + new Date().toISOString()))
        await this.flowStateAccessor.set(context, this.state)
        return this.state?.userToken!
      } else {
        logger.warn('Token exchange failed')
        this.state!.flowStarted = true
        this.state!.userToken = ''
        await context.sendActivity(MessageFactory.text('Exchange failed. Please try again.'))
        return null
      }
    }
    return null
  }

  /**
   * Signs the user out.
   * @param context The turn context.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  public async signOut (context: TurnContext): Promise<void> {
    await this.userTokenClient?.signOut(context.activity.from?.id as string, context.adapter.authConfig.connectionName as string, context.activity.channelId as string)
    this.state!.userToken = ''
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
}
