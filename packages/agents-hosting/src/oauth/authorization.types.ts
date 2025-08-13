/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { FlowState, OAuthFlow } from './oAuthFlow'

/**
 * Interface defining an authorization handler for OAuth flows.
 * @interface AuthHandler
 */
export interface AuthHandler {
  /** Connection name for the auth provider. */
  name?: string,
  /** The OAuth flow implementation. */
  flow?: OAuthFlow,
  /** Title to display on auth cards/UI. */
  title?: string,
  /** Text to display on auth cards/UI. */
  text?: string,

  cnxPrefix?: string
}

/**
 * Options for configuring user authorization.
 * Contains settings to configure OAuth connections.
 * @interface AuthorizationHandlers
 */
export interface AuthorizationHandlers extends Record<string, AuthHandler> {}

/**
 * Represents the state of a sign-in process.
 * @interface SignInHandlerState
 */
export interface SignInHandlerState {
  /** Identifier of the auth handler being used. */
  id: string,
  /**
   * Current status of the sign-in process.
   * @remarks
   * Order of execution: begin -> continue -> success
   *
   * - **begin**: [begin] Initial state, no flow started.
   * - **continue**: [continue] OAuth flow has started, waiting for user interaction.
   * - **success**: [auth success] OAuth flow success, token available.
   * - **failure**: [auth failure] OAuth flow failure, no token available. Removed from storage.
  */
  status: 'begin' | 'continue' | 'success' | 'failure'
  /** Optional state of the OAuth flow, if applicable. */
  state?: FlowState
  /** Optional activity to continue with after sign-in completion. */
  continuationActivity?: Activity
}
