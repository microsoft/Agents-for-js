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

/**
 * Class representing the OAuth flow for Teams with app-specific styling.
 */
export class TeamsOAuthFlowAppStyle {
  /**
   * The user token client used for token operations.
   */
  userTokenClient?: UserTokenClient

  /**
   * The ID of the token exchange request, used to prevent duplicate processing.
   */
  tokenExchangeId: string | null = null

  /**
   * The storage instance used for persisting state.
   */
  storage: Storage

  /**
   * The application state, which includes SSO-related data.
   */
  appState: TurnState | null = null

  /**
   * Creates an instance of TeamsOAuthFlowAppStyle.
   * @param storage - The storage instance for persisting state.
   */
  constructor (storage: Storage) {
    this.storage = storage
  }

  /**
   * Begins the OAuth flow for the user.
   * @param context - The turn context of the bot.
   * @param state - The turn state containing SSO-related data.
   * @returns A promise that resolves to the user token if available, or an empty string.
   */
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
    const signingResource: SigningResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity.getConversationReference(), context.activity.relatesTo)
    const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName as string, 'Sign in', '', signingResource)
    await context.sendActivity(MessageFactory.attachment(oCard))
    state.sso.flowStarted = true
    state.sso.flowExpires = Date.now() + 30000
    await state.save(context, this.storage)
    logger.info('OAuth flow started')
    return retVal
  }

  /**
   * Continues the OAuth flow by processing the token exchange request.
   * @param context - The turn context of the bot.
   * @returns A promise that resolves to the user token if the flow is successful, or an empty string.
   */
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

  /**
   * Signs out the user and clears the SSO state.
   * @param context - The turn context of the bot.
   * @returns A promise that resolves when the sign-out process is complete.
   */
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

  /**
   * Retrieves the signed-in user's token from the application state.
   * @param context - The turn context of the bot.
   * @returns A promise that resolves to the user token if available, or undefined.
   */
  public async userSignedInToken (context: TurnContext) {
    await this.appState?.load(context, this.storage)
    return this.appState?.sso?.userToken
  }
}
