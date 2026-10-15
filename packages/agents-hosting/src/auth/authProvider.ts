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
   * The AuthConfiguration used for token acquisition.
   */
  connectionSettings?: AuthConfiguration

  /**
   * Gets an access token for the specified authentication configuration and scope.
   * @param authConfig - The authentication configuration.
   * @param scope - The scope for which the access token is requested.
   * @returns A promise that resolves to the access token.
   */
  getAccessToken (authConfig: AuthConfiguration, scope: string): Promise<string>
  /**
   * Gets an access token using this provider's connection settings.
   *
   * @param scope - Scope for which the access token is requested.
   * @returns A promise that resolves to the access token.
   */
  getAccessToken (scope: string): Promise<string>
  /**
   * Gets an access token using explicit or provider-level settings.
   *
   * @param authConfigOrScope - Authentication configuration, or the scope when using provider settings.
   * @param scope - Scope used with an explicit authentication configuration.
   * @returns A promise that resolves to the access token.
   */
  getAccessToken (authConfigOrScope: AuthConfiguration | string, scope?: string): Promise<string>

  /**
   * Get an access token for the agentic application
   * @param tenantId
   * @param agentAppInstanceId
   * @returns a promise that resolves to the access token.
   */
  getAgenticApplicationToken: (tenantId: string, agentAppInstanceId: string) => Promise<string>

  /**
   * Get an access token for the agentic instance
   * @param tenantId
   * @param agentAppInstanceId
   * @returns a promise that resolves to the access token.
   */
  getAgenticInstanceToken: (tenantId: string, agentAppInstanceId: string) => Promise<string>

  /**
   * Get an access token for the agentic user
   * @param tenantId
   * @param agentAppInstanceId
   * @param upn
   * @param scopes
   * @returns a promise that resolves to the access token.
   */
  getAgenticUserToken: (tenantId: string, agentAppInstanceId: string, upn: string, scopes: string[]) => Promise<string>

  /**
   * Acquires a token on behalf of a user using this provider's connection settings.
   *
   * @param scopes - Scopes requested for the delegated token.
   * @param oboAssertion - User assertion exchanged for the token.
   * @returns A promise that resolves to the delegated access token.
   */
  acquireTokenOnBehalfOf (scopes: string[], oboAssertion: string): Promise<string>
  /**
   * Acquires a token on behalf of a user using explicit authentication settings.
   *
   * @param authConfig - Authentication configuration.
   * @param scopes - Scopes requested for the delegated token.
   * @param oboAssertion - User assertion exchanged for the token.
   * @returns A promise that resolves to the delegated access token.
   */
  acquireTokenOnBehalfOf (authConfig: AuthConfiguration, scopes: string[], oboAssertion: string): Promise<string>
  /**
   * Acquires a delegated token using explicit or provider-level settings.
   *
   * @param authConfigOrScopes - Authentication configuration, or requested scopes when using provider settings.
   * @param scopesOrOboAssertion - Requested scopes or the user assertion, depending on the overload.
   * @param oboAssertion - User assertion used with explicit authentication settings.
   * @returns A promise that resolves to the delegated access token.
   */
  acquireTokenOnBehalfOf (
    authConfigOrScopes: AuthConfiguration | string[],
    scopesOrOboAssertion?: string[] | string,
    oboAssertion?: string
  ): Promise<string>
}
