// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Attachment } from '@microsoft/agents-bot-activity'
import { UserTokenClient } from '../../oauth/userTokenClient'
import { CloudAdapter } from '../../cloudAdapter'
import { CardFactory } from '../../cards/cardFactory'
import { TurnContext } from '../../turnContext'
import { MessageFactory } from '../../messageFactory'
import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'

const logger = debug('agents:web-chat-oauth-flow')

export class FlowState<FlowProfile> extends TurnState {
  protected async onComputeStorageKeys (context: TurnContext) {
    const keys = await super.onComputeStorageKeys(context)
    keys['flow'] = 'flowKey'
    return keys
  }

  public get flow (): FlowProfile {
    const scope = this.getScope('flow')
    if (!scope) {
      throw new Error('FlowState hasn\'t been loaded. Call load() first.')
    }
    return scope.value as FlowProfile
  }

  public set flow (value) {
    const scope = this.getScope('flow')
    if (!scope) {
      throw new Error('FlowState hasn\'t been loaded. Call load() first.')
    }
    scope.replace(value as Record<string, unknown>)
  }
}

class FlowProfile {
  public flowStarted: boolean = false
  public userToken: string = ''
  public flowExpires: number = 0
}

export class WebChatOAuthFlowAppStyle {
  userTokenClient?: UserTokenClient
  flowProfile: FlowProfile
  storage: Storage
  appState: FlowState<FlowProfile>

  constructor (storage: Storage) {
    this.flowProfile = new FlowProfile()
    this.storage = storage
    this.appState = new FlowState<FlowProfile>()
  }

  public async getOAuthToken (context: TurnContext) : Promise<string> {
    this.flowProfile = await this.getUserState(context)
    if (this.flowProfile!.userToken !== '') {
      return this.flowProfile.userToken
    }
    if (this.flowProfile?.flowExpires !== 0 && Date.now() > this.flowProfile.flowExpires) {
      logger.warn('Sign-in flow expired')
      this.flowProfile.flowStarted = false
      this.flowProfile.userToken = ''
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

    if (this.flowProfile!.flowStarted === true) {
      const userToken = await this.userTokenClient.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!)
      if (userToken !== null) {
        logger.info('Token obtained')
        this.flowProfile.userToken = userToken.token
        this.flowProfile.flowStarted = false
      } else {
        const code = context.activity.text as string
        const userToken = await this.userTokenClient!.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!, code)
        if (userToken !== null) {
          logger.info('Token obtained with code')
          this.flowProfile.userToken = userToken.token
          this.flowProfile.flowStarted = false
        } else {
          logger.error('Sign in failed')
          await context.sendActivity(MessageFactory.text('Sign in failed'))
        }
      }
      retVal = this.flowProfile.userToken
    } else if (this.flowProfile!.flowStarted === false) {
      const signingResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
      const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName!, 'Sign in', '', signingResource)
      await context.sendActivity(MessageFactory.attachment(oCard))
      this.flowProfile!.flowStarted = true
      this.flowProfile.flowExpires = Date.now() + 30000
      logger.info('OAuth flow started')
    }
    this.appState.save(context, this.storage)
    return retVal
  }

  async signOut (context: TurnContext) {
    await this.userTokenClient!.signOut(context.activity.from?.id!, context.adapter.authConfig.connectionName!, context.activity.channelId!)
    this.flowProfile!.flowStarted = false
    this.flowProfile!.userToken = ''
    this.flowProfile!.flowExpires = 0
    this.appState.save(context, this.storage)
    logger.info('User signed out successfully')
  }

  private async getUserState (context: TurnContext) {
    await this.appState.load(context, this.storage)
    return this.flowProfile
  }
}
