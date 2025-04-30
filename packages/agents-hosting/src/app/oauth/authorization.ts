/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { TurnContext } from '../../turnContext'
import { debug } from '../../logger'
import { TurnState } from '../turnState'
import { Storage } from '../../storage'
import { OAuthFlow, TokenRequestStatus, TokenResponse } from '../../oauth'
import { UserState } from '../../state'

const logger = debug('agents:authorization')

export interface AuthHandler {
  name?: string,
  auto?: boolean,
  flow?: OAuthFlow,
  title?: string,
  text?: string,
}

/**
 * Options for configuring user authorization.
 * Contains settings to configure OAuth connections.
 */
export interface AuthorizationHandlers extends Record<string, AuthHandler> {}

export class Authorization {
  _authHandlers: AuthorizationHandlers
  /**
   * Creates a new instance of UserAuthorization.
   * @param {Storage} storage - The storage system to use for state management.
   */
  constructor (storage: Storage, authHandlers: AuthorizationHandlers) {
    const userState = new UserState(storage)
    if (authHandlers === undefined || Object.keys(authHandlers).length === 0) {
      throw new Error('The authorization does not have any auth handlers')
    }
    this._authHandlers = authHandlers
    for (const ah in this._authHandlers) {
      if (this._authHandlers![ah].name === undefined && process.env[ah + '_connectionName'] === undefined) {
        throw new Error(`Environment variable ${ah}_connectionName not set in autorization and not found in env vars.`)
      }
      const currentAuthHandler = this._authHandlers![ah]
      currentAuthHandler.name = currentAuthHandler.name ?? process.env[ah + '_connectionName'] as string
      currentAuthHandler.title = currentAuthHandler.title ?? process.env[ah + '_connectionTitle'] as string
      currentAuthHandler.text = currentAuthHandler.text ?? process.env[ah + '_connectionText'] as string
      currentAuthHandler.auto = currentAuthHandler.auto ?? process.env[ah + '_connectionAuto'] === 'true'
      currentAuthHandler.flow = new OAuthFlow(userState, currentAuthHandler.name, null!, currentAuthHandler.title, currentAuthHandler.text)
    }
  }

  public async getToken (context: TurnContext, authHandlerId?: string): Promise<TokenResponse> {
    logger.info('getToken from user token service for authHandlerId:', authHandlerId)
    const authHandler = this.resolverHandler(authHandlerId)
    return await authHandler.flow?.getUserToken(context)!
  }

  public async beginOrContinueFlow (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<TokenResponse> {
    const flow = this.resolverHandler(authHandlerId).flow!
    let tokenResponse: TokenResponse
    if (flow.state!.flowStarted === false) {
      tokenResponse = await flow.beginFlow(context)
    } else {
      tokenResponse = await flow.continueFlow(context)
      if (tokenResponse.status === TokenRequestStatus.Success) {
        if (this._signInHandler) {
          await this._signInHandler(context, state, authHandlerId)
        }
      }
    }
    return tokenResponse
  }

  public getFlowState (authHandlerId?: string) : boolean {
    const flow = this.resolverHandler(authHandlerId).flow!
    return flow.state?.flowStarted!
  }

  resolverHandler = (authHandlerId?: string) : AuthHandler => {
    if (authHandlerId) {
      return this._authHandlers![authHandlerId]
    }
    return this._authHandlers![Object.keys(this._authHandlers)[0]]
  }

  /**
   * Signs out the current user.
   * This method clears the user's token and resets the SSO state.
   *
   * @param {TurnContext} context - The context object for the current turn.
   * @param {TurnState} state - The state object for the current turn.
   */
  async signOut (context: TurnContext, state: TurnState, authHandlerId?: string) : Promise<void> {
    // await this.resolverHandler(authHandlerId).flow?.signOut(context)
    for (const ah in this._authHandlers) {
      await this._authHandlers[ah].flow?.signOut(context)
    }
  }

  _signInHandler: ((context: TurnContext, state: TurnState, authHandlerId?: string) => void) | null = null
  public onSignInSuccess (handler: (context: TurnContext, state: TurnState, authHandlerId?: string) => void) {
    this._signInHandler = handler
  }
}
