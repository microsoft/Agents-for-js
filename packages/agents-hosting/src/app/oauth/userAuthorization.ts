/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-activity'
import { UserTokenClient } from '../../oauth/userTokenClient'
import { CloudAdapter } from '../../cloudAdapter'
import { CardFactory } from '../../cards/cardFactory'
import { TurnContext } from '../../turnContext'
import { MessageFactory } from '../../messageFactory'
import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'

const logger = debug('agents:user-authorization')

/**
 * Handles user authorization and OAuth token management.
 * This class provides functionality for obtaining OAuth tokens, initiating sign-in flows,
 * and managing user authentication state.
 */
export class UserAuthorization {
  /**
   * Client for user token operations.
   * Used to obtain tokens, sign-in resources, and handle sign-out.
   */
  userTokenClient?: UserTokenClient

  /**
   * Storage system used for maintaining state between turns.
   */
  storage: Storage

  connectionName: string

  /**
   * Creates a new instance of UserAuthorization.
   * @param {Storage} storage - The storage system to use for state management.
   */
  constructor (storage: Storage, connectionName: string) {
    this.storage = storage
    this.connectionName = connectionName
  }

  /**
   * Gets an OAuth token for the current user.
   * This method handles the complete OAuth flow including:
   * - Initializing SSO state if needed
   * - Checking for existing valid tokens
   * - Handling expired auth flows
   * - Initiating new auth flows
   * - Processing auth responses
   *
   * @param {TurnContext} context - The context object for the current turn.
   * @param {TurnState} state - The state object for the current turn.
   * @returns {Promise<string>} A promise that resolves to the OAuth token string, or an empty string if the flow is still in progress.
   * @throws {Error} If the connection name is not configured in the auth settings.
   */
  public async getOAuthToken (context: TurnContext, state: TurnState) : Promise<string> {
    if (Object.keys(state.sso).length === 0) {
      state.sso.flowStarted = false
      state.sso.userToken = ''
      state.sso.flowExpires = 0
      await state.save(context)
    }
    if (state.sso!.userToken !== '') {
      return state.sso.userToken
    }
    if (state.sso?.flowExpires !== 0 && Date.now() > state.sso.flowExpires) {
      logger.warn('Sign-in flow expired')
      state.sso.flowStarted = false
      state.sso.userToken = ''
      await context.sendActivity(MessageFactory.text('Sign-in session expired. Please try again.'))
    }

    let retVal: string = ''
    const authConfig = context.adapter.authConfig
    if (this.connectionName === undefined) {
      throw new Error('connectionName is not set in the auth config, review your environment variables')
    }
    const adapter = context.adapter as CloudAdapter
    const scope = 'https://api.botframework.com'
    const accessToken = await adapter.authProvider.getAccessToken(authConfig, scope)
    this.userTokenClient = new UserTokenClient(accessToken)

    if (state.sso!.flowStarted === true) {
      const userToken = await this.userTokenClient.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!)
      if (userToken !== null) {
        logger.info('Token obtained')
        state.sso.userToken = userToken.token!
        state.sso.flowStarted = false
      } else {
        const code = context.activity.text as string
        const userToken = await this.userTokenClient!.getUserToken(authConfig.connectionName!, context.activity.channelId!, context.activity.from?.id!, code)
        if (userToken !== null) {
          logger.info('Token obtained with code')
          state.sso.userToken = userToken.token!
          state.sso.flowStarted = false
        } else {
          logger.error('Sign in failed')
          await context.sendActivity(MessageFactory.text('Sign in failed'))
        }
      }
      retVal = state.sso.userToken
    } else if (state.sso!.flowStarted === false) {
      const signingResource = await this.userTokenClient.getSignInResource(authConfig.clientId!, authConfig.connectionName!, context.activity)
      const oCard: Attachment = CardFactory.oauthCard(authConfig.connectionName!, 'Sign in', '', signingResource)
      await context.sendActivity(MessageFactory.attachment(oCard))
      state.sso!.flowStarted = true
      state.sso.flowExpires = Date.now() + 30000
      logger.info('OAuth flow started')
    }
    state.save(context)
    return retVal
  }

  /**
   * Signs out the current user.
   * This method clears the user's token and resets the SSO state.
   *
   * @param {TurnContext} context - The context object for the current turn.
   * @param {TurnState} state - The state object for the current turn.
   */
  async signOut (context: TurnContext, state: TurnState) {
    await this.userTokenClient!.signOut(context.activity.from?.id!, context.adapter.authConfig.connectionName!, context.activity.channelId!)
    state.sso!.flowStarted = false
    state.sso!.userToken = ''
    state.sso!.flowExpires = 0
    state.save(context)
    logger.info('User signed out successfully')
  }
}
