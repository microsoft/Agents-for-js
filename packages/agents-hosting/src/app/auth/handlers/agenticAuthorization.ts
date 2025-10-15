/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity'
import { AgentApplication } from '../..'
import { TurnContext } from '../../../turnContext'
import { ActiveAuthorizationHandler, AuthorizationHandler, AuthorizationHandlerSettings, AuthorizationHandlerStatus } from '../types'
import { TokenResponse } from '../../../oauth'

const logger = debug('agents:authorization:agentic')

/**
 * Options for configuring the Agentic authorization handler.
 */
export interface AgenticAuthorizationOptions {
  /**
   * The type of authorization handler.
   */
  type: 'agentic'
  /**
   * The scopes required for the authorization.
   */
  scopes: string[]
  /**
   * (Optional) An alternative connection name to use for the authorization process.
   */
  altBlueprintConnectionName?: string
}

/**
 * Settings for configuring the Agentic authorization handler.
 */
export interface AgenticAuthorizationSettings extends AuthorizationHandlerSettings {}

/**
 * Authorization handler for Agentic authentication.
 */
export class AgenticAuthorization implements AuthorizationHandler {
  constructor (public readonly id: string, private options: AgenticAuthorizationOptions, private settings: AgenticAuthorizationSettings) {}

  signin (context: TurnContext, active?: ActiveAuthorizationHandler): Promise<AuthorizationHandlerStatus> {
    logger.info('signin called')
    return Promise.resolve(AuthorizationHandlerStatus.IGNORED)
  }

  signout (context: TurnContext): Promise<boolean> {
    logger.info('signout called')
    return Promise.resolve(false)
  }

  token (context: TurnContext): Promise<TokenResponse> {
    logger.info('token called')
    return Promise.resolve({ token: undefined })
  }

  onSuccess (callback: (context: TurnContext) => void): void {
    logger.info('onSuccess called')
  }

  onFailure (callback: (context: TurnContext, reason?: string) => void): void {
    logger.info('onFailure called')
  }
}
