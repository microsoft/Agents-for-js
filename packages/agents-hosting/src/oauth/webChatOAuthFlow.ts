// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Attachment } from '@microsoft/agents-activity'
import { UserTokenClient } from './userTokenClient'
import { CloudAdapter } from '../cloudAdapter'
import { CardFactory } from '../cards/cardFactory'
import { AgentStatePropertyAccessor } from '../state/agentStatePropertyAccesor'
import { UserState } from '../state/userState'
import { TurnContext } from '../turnContext'
import { MessageFactory } from '../messageFactory'
import { debug } from '../logger'

const logger = debug('agents:oauth-flow')

class FlowState {
  public flowStarted: boolean = false
  public userToken: string = ''
  public flowExpires: number = 0
}

/**
 * Manages the OAuth flow for Web Chat.
 */
export class WebChatOAuthFlow {
  userTokenClient?: UserTokenClient
  state: FlowState | null
  flowStateAccessor: AgentStatePropertyAccessor<FlowState | null>

  /**
   * Creates a new instance of WebChatOAuthFlow.
   * @param userState The user state.
   */
  constructor (userState: UserState) {
    this.state = null
    this.flowStateAccessor = userState.createProperty('flowState')
  }

  /**
   * Gets the OAuth token.
   * @param context The turn context.
   * @returns A promise that resolves to the user token.
   */
  public async getOAuthToken (context: TurnContext) : Promise<string> {
    this.state = await this.getUserState(context)
    if (this.state!.userToken !== '') {
      logger.info('Token available in UseState')
      return this.state.userToken
    }
    if (this.state?.flowExpires !== 0 && Date.now() > this.state.flowExpires) {
      logger.info('flow expired')
      this.state.flowStarted = false
      this.state.userToken = ''
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
    }

    let retVal: string = ''
    const authConfig = context.adapter.authConfig
    if (authConfig.connectionName === undefined) {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    const adapter = context.adapter as CloudAdapter
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new UserTokenClient(accessToken)

    if (this.state!.flowStarted === true) {
      const userToken = await this.userTokenClient.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!)
      if (userToken !== null) {
        logger.info('Token retrieved from service')
        this.state.userToken = userToken.token
        this.state.flowStarted = false
      } else {
        const code = context.activity.text as string
        logger.info('Token not available from service, sending magic code ' + code)
        const userToken = await this.userTokenClient!.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!, code)
        if (userToken !== null) {
          logger.info('Token obtained with code')
          this.state.userToken = userToken.token
          this.state.flowStarted = false
        } else {
          logger.info('Token service returned null token')
          await context.sendActivity(MessageFactory.text('Sign in failed'))
        }
      }
      retVal = this.state.userToken
    } else if (this.state!.flowStarted === false) {
      logger.info('Starting OAuth flow')
      const signingResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
      const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName!, 'Sign in', '', signingResource)
      await context.sendActivity(MessageFactory.attachment(oCard))
      this.state!.flowStarted = true
      this.state.flowExpires = Date.now() + 30000
      logger.info('OAuth flow started')
    }
    this.flowStateAccessor.set(context, this.state)
    return retVal
  }

  /**
   * Signs the user out.
   * @param context The turn context.
   * @returns A promise that resolves when the sign-out operation is complete.
   */
  async signOut (context: TurnContext) {
    await this.userTokenClient!.signOut(context.activity.from?.id!, context.adapter.authConfig.connectionName!, context.activity.channelId!)
    this.state!.flowStarted = false
    this.state!.userToken = ''
    this.state!.flowExpires = 0
    this.flowStateAccessor.set(context, this.state)
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
