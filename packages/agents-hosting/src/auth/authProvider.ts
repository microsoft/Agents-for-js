/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './authConfiguration'

/**
 * Represents an authentication provider.
 */
export interface AuthProvider {
  /**
   * Gets an access token for the specified authentication configuration and scope.
   * @param authConfig - The authentication configuration.
   * @param scope - The scope for which the access token is requested.
   * @returns A promise that resolves to the access token.
   */
  getAccessToken: (authConfig: AuthConfiguration, scope: string) => Promise<string>

  /**
   * Get an access token for the agentic application
   * @param agentAppInstanceId
   * @returns a promise that resolves to the access token.
   */
  getAgenticApplicationToken: (agentAppInstanceId: string) => Promise<string>

  /**
   * Get an access token for the agentic instance
   * @param agentAppInstanceId
   * @returns a promise that resolves to the access token.
   */
  getAgenticInstanceToken: (agentAppInstanceId: string) => Promise<string>

  /**
   * Get an access token for the agentic user
   * @param agentAppInstanceId
   * @param upn
   * @param scopes
   * @returns a promise that resolves to the access token.
   */
  getAgenticUserToken: (agentAppInstanceId: string, upn: string, scopes: string[]) => Promise<string>

  acquireTokenOnBehalfOf (scopes: string[], oboAssertion: string): Promise<string>
  acquireTokenOnBehalfOf (authConfig: AuthConfiguration, scopes: string[], oboAssertion: string): Promise<string>
  acquireTokenOnBehalfOf (
    authConfigOrScopes: AuthConfiguration | string[],
    scopesOrOboAssertion?: string[] | string,
    oboAssertion?: string
  ): Promise<string>
}
