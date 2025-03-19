// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import {
  Activity,
  ActivityTypes,
  Attachment,
  debug,
  CloudAdapter,
  CardFactory,
  TurnContext,
  MessageFactory,
  SigningResource,
  TokenExchangeRequest,
  TurnState,
  Storage
} from '@microsoft/agents-bot-hosting'
import { TeamsUserTokenClient } from '../../oauth'

const logger = debug('agents:teams-oauth-flow-app-style')

export class TeamsOAuthFlowAppStyle {
  userTokenClient?: TeamsUserTokenClient
  tokenExchangeId: string | null = null
  storage: Storage

  constructor (storage: Storage) {
    this.storage = storage
  }

  public async beginFlow (context: TurnContext, state: TurnState): Promise<string> {
    if (Object.keys(state.sso).length === 0) {
      state.sso.flowStarted = false
      state.sso.userToken = ''
      state.sso.flowExpires = 0
      await state.save(context)
    }
    if (state.sso.userToken !== '') {
      return state.sso.userToken
    }

    const adapter = context.adapter as CloudAdapter
    const authConfig = context.adapter.authConfig
    if (authConfig.connectionName === undefined) {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new TeamsUserTokenClient(accessToken)
    const retVal: string = ''
    await context.sendActivities([MessageFactory.text('authorizing user'), new Activity(ActivityTypes.Typing)])
    const signingResource: SigningResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
    const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName as string, 'Sign in', '', signingResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    state.sso.flowStarted = true
    state.sso.flowExpires = Date.now() + 30000
    await state.save(context)
    logger.info('OAuth flow started')
    return retVal
  }

  public async continueFlow (context: TurnContext, state: TurnState): Promise<string> {
    if (state.sso?.flowExpires !== 0 && Date.now() > state.sso!.flowExpires) {
      logger.warn('Sign-in flow expired')
      state.sso!.flowStarted = false
      state.sso!.userToken = ''
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
      return ''
    }
    const contFlowActivity = context.activity
    const authConfig = context.adapter.authConfig
    const tokenExchangeRequest = contFlowActivity.value as TokenExchangeRequest
    if (this.tokenExchangeId === tokenExchangeRequest.id) {
      return '' // dedupe
    }
    this.tokenExchangeId = tokenExchangeRequest.id!
    const userTokenReq = await this.userTokenClient?.exchangeTokenAsync(contFlowActivity.from?.id!, authConfig.connectionName!, contFlowActivity.channelId!, tokenExchangeRequest)
    logger.info('Token obtained')
    state.sso!.userToken = userTokenReq.token
    state.sso!.flowStarted = false
    await context.sendActivity(MessageFactory.text('User signed in' + new Date().toISOString()))
    await state.save(context)
    return state.sso?.userToken!
  }

  public async signOut (context: TurnContext, state: TurnState): Promise<void> {
    await this.userTokenClient?.signOut(context.activity.from?.id as string, context.adapter.authConfig.connectionName as string, context.activity.channelId as string)
    await context.sendActivity(MessageFactory.text('User signed out'))
    state.sso!.userToken = ''
    state.sso!.flowExpires = 0
    await state.save(context)
    logger.info('User signed out successfully')
  }
}
