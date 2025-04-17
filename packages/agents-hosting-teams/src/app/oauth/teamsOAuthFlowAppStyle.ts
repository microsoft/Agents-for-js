// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { Activity, ActivityTypes, Attachment } from '@microsoft/agents-activity'
import {
  debug,
  CloudAdapter,
  CardFactory,
  TurnContext,
  MessageFactory,
  SigningResource,
  TokenExchangeRequest,
  TurnState,
  Storage,
  UserTokenClient,
  TokenRequestStatus
} from '@microsoft/agents-hosting'

const logger = debug('agents:teams-oauth-flow-app-style')

export class TeamsOAuthFlowAppStyle {
  userTokenClient?: UserTokenClient
  tokenExchangeId: string | null = null
  storage: Storage
  appState: TurnState | null = null

  constructor (storage: Storage) {
    this.storage = storage
  }

  public async beginFlow (context: TurnContext, state: TurnState): Promise<string> {
    await state.load(context, this.storage)
    if (this.appState === null) {
      this.appState = state
    }
    if (Object.keys(this.appState.sso).length === 0) {
      this.appState.sso.flowStarted = false
      this.appState.sso.userToken = ''
      this.appState.sso.flowExpires = 0
      await this.appState.save(context, this.storage)
    }
    if (this.appState.sso.userToken !== '') {
      return this.appState.sso.userToken
    }

    const adapter = context.adapter as CloudAdapter
    const authConfig = context.adapter.authConfig
    if (authConfig.connectionName === undefined) {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new UserTokenClient(accessToken)
    const retVal: string = ''
    await context.sendActivities([MessageFactory.text('authorizing user'), new Activity(ActivityTypes.Typing)])
    const signingResource: SigningResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
    const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName as string, 'Sign in', '', signingResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    state.sso.flowStarted = true
    state.sso.flowExpires = Date.now() + 30000
    await state.save(context, this.storage)
    logger.info('OAuth flow started')
    return retVal
  }

  public async continueFlow (context: TurnContext) {
    if (this.appState!.sso!.userToken !== '') {
      return ''
    }
    await this.appState!.load(context, this.storage)
    if (this.appState!.sso?.flowExpires !== 0 && Date.now() > this.appState!.sso!.flowExpires) {
      logger.warn('Sign-in flow expired')
      this.appState!.sso!.flowStarted = false
      this.appState!.sso!.userToken = ''
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
    if (userTokenReq?.status === TokenRequestStatus.Success) {
      logger.info('Token obtained')
      // this.appState!.sso!.userToken = userTokenReq.token
      this.appState!.sso!.flowStarted = false
      await context.sendActivity(MessageFactory.text('User signed in ' + new Date().toISOString()))
      await this.appState!.save(context, this.storage)
      return this.appState!.sso?.userToken!
    }
  }

  public async signOut (context: TurnContext): Promise<void> {
    if (this.appState !== null) {
      await this.appState.load(context, this.storage)
      await this.userTokenClient?.signOut(context.activity.from?.id as string, context.adapter.authConfig.connectionName as string, context.activity.channelId as string)
      await context.sendActivity(MessageFactory.text('User signed out'))
      this.appState.sso!.userToken = ''
      this.appState.sso!.flowExpires = 0
      await this.appState.save(context, this.storage)
      logger.info('User signed out successfully')
    } else {
      await context.sendActivity(MessageFactory.text('User is not signed in'))
    }
  }

  public async userSignedInToken (context: TurnContext) {
    await this.appState?.load(context, this.storage)
    return this.appState?.sso?.userToken
  }
}
