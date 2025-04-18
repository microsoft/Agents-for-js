/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../../turnContext'
// import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'
import { OAuthFlow, TokenRequestStatus, TokenResponse } from '../../oauth'
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

export class UserIdentity {
  oAuthFlow: OAuthFlow

  /**
   * Creates a new instance of UserAuthorization.
   * @param {Storage} storage - The storage system to use for state management.
   */
  constructor (storage: Storage, connectionName: string) {
    const userState = new UserState(storage)
    this.oAuthFlow = new OAuthFlow(userState, connectionName)
  }

  public async getToken (context: TurnContext): Promise<TokenResponse> {
    return await this.oAuthFlow.getUserToken(context)
  }

  public async authenticate (context: TurnContext, state: TurnState) : Promise<TokenResponse> {
    let tokenResponse: TokenResponse
    if (this.oAuthFlow.state?.flowStarted === false) {
      tokenResponse = await this.oAuthFlow.beginFlow(context)
    } else {
      tokenResponse = await this.oAuthFlow.continueFlow(context)
      if (tokenResponse.status === TokenRequestStatus.Success) {
        if (this._signInHandler) {
          await this._signInHandler(context, state)
        }
      }
    }
    return tokenResponse
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

  _signInHandler: ((context: TurnContext, state: TurnState) => void) | null = null
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState) => void) {
    this._signInHandler = handler
  }
}
