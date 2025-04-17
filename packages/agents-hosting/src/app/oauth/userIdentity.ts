/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { UserTokenClient } from '../../oauth/userTokenClient'
import { TurnContext } from '../../turnContext'
// import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'
import { OAuthFlow, TokenResponse } from '../../oauth'
import { UserState } from '../../state'

// const logger = debug('agents:user-identity')

/**
 * Options for configuring user identity.
 * Contains settings related to Single Sign-On (SSO) authentication.
 */
export interface UserIdentityOptions {
  /**
   * Determines whether Single Sign-On (SSO) is enabled for user authentication.
   */
  enableSSO: boolean;

  /**
   * The name of the SSO connection to use when SSO is enabled.
   * Only applicable when enableSSO is set to true.
   */
  ssoConnectionName?: string;
}

/**
 * Handles user authorization and OAuth token management.
 * This class provides functionality for obtaining OAuth tokens, initiating sign-in flows,
 * and managing user authentication state.
 */
export class UserIdentity {
  /**
   * Client for user token operations.
   * Used to obtain tokens, sign-in resources, and handle sign-out.
   */
  userTokenClient?: UserTokenClient

  /**
   * Storage system used for maintaining state between turns.
   */
  storage: Storage

  /**
   * The connection name for the OAuth flow.
   */
  connectionName: string

  oAuthFlow: OAuthFlow

  /**
   * Creates a new instance of UserAuthorization.
   * @param {Storage} storage - The storage system to use for state management.
   */
  constructor (storage: Storage, connectionName: string) {
    this.storage = storage
    this.connectionName = connectionName
    const userState = new UserState(storage)
    this.oAuthFlow = new OAuthFlow(userState, connectionName)
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
  public async getOAuthToken (context: TurnContext, state: TurnState) : Promise<TokenResponse> {
    return await this.oAuthFlow.beginFlow(context)
  }

  /**
   * Signs out the current user.
   * This method clears the user's token and resets the SSO state.
   *
   * @param {TurnContext} context - The context object for the current turn.
   * @param {TurnState} state - The state object for the current turn.
   */
  async signOut (context: TurnContext, state: TurnState) {
    await this.oAuthFlow.signOut(context)
  }
}
