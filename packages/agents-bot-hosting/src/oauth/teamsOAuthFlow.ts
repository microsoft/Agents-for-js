// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity-schema'
import { SigningResource } from './signingResource'
import { TokenExchangeRequest } from './tokenExchangeRequest'
import { UserTokenClient } from './userTokenClient'
import { CloudAdapter } from '../cloudAdapter'
import { CardFactory } from '../cards/cardFactory'
import { BotStatePropertyAccessor } from '../state/botStatePropertyAccesor'
import { UserState } from '../state/userState'
import { TurnContext } from '../turnContext'
import { MessageFactory } from '../messageFactory'

class FlowState {
  public flowStarted: boolean = false
  public userToken: string = ''
}

export class TeamsOAuthFlow {
  userTokenClient?: UserTokenClient
  state: FlowState | null
  flowStateAccessor: BotStatePropertyAccessor<FlowState | null>
  tokenExchangeId: string | null = null
  constructor (userState: UserState) {
    this.state = null
    this.flowStateAccessor = userState.createProperty('flowState')
  }

  public async beginFlow (context: TurnContext): Promise<string> {
    this.state = await this.getUserState(context)

    if (this.state.userToken !== '') {
      return this.state.userToken
    }

    const adapter = context.adapter as CloudAdapter
    const authConfig = context.adapter.authConfig
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new UserTokenClient(accessToken)
    const retVal: string = ''
    await context.sendActivities([MessageFactory.text('authorizing user'), new Activity(ActivityTypes.Typing)])
    const signingResource: SigningResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
    const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName as string, 'Sign in', '', signingResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    this.state.flowStarted = true
    await this.flowStateAccessor.setAsync(context, this.state)
    return retVal
  }

  public async continueFlow (context: TurnContext): Promise<string> {
    this.state = await this.getUserState(context)
    const contFlowActivity = context.activity
    const authConfig = context.adapter.authConfig
    const tokenExchangeRequest = contFlowActivity.value as TokenExchangeRequest
    if (this.tokenExchangeId === tokenExchangeRequest.id) {
      return '' // dedupe
    }
    this.tokenExchangeId = tokenExchangeRequest.id!
    const userTokenReq = await this.userTokenClient?.exchangeTokenAsync(contFlowActivity.from?.id!, authConfig.connectionName!, contFlowActivity.channelId!, tokenExchangeRequest)
    this.state!.userToken = userTokenReq.token
    this.state!.flowStarted = false
    await context.sendActivity(MessageFactory.text('User signed in' + new Date().toISOString()))
    await this.flowStateAccessor.setAsync(context, this.state)
    return this.state?.userToken!
  }

  public async signOut (context: TurnContext): Promise<void> {
    await this.userTokenClient?.signOut(context.activity.from?.id as string, context.adapter.authConfig.connectionName as string, context.activity.channelId as string)
    await context.sendActivity(MessageFactory.text('User signed out'))
    this.state!.userToken = ''
    await this.flowStateAccessor.setAsync(context, this.state)
  }

  private async getUserState (context: TurnContext) {
    let userProfile: FlowState | null = await this.flowStateAccessor.getAsync(context, null)
    if (userProfile === null) {
      userProfile = new FlowState()
    }
    return userProfile
  }
}
