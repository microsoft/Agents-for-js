/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AccessToken, GetTokenOptions, TokenCredential } from '@azure/core-auth'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import { TokenResponse } from '../oauth'

/**
 * Default lifetime assumed for a token when the underlying provider does not report an expiration.
 */
const DEFAULT_TOKEN_LIFETIME_MS = 5 * 60 * 1000

/**
 * Azure Core Auth {@link TokenCredential} implementation backed by an Agents SDK token provider
 *
 * @remarks
 * This allows Agents SDK-managed tokens (user sign-in, OBO exchange) to be consumed directly by
 * Azure SDK clients that expect a `TokenCredential`.
 */
export class DelegatedTokenCredential implements TokenCredential {
  /**
   * Creates a new instance of DelegatedTokenCredential.
   * @param provider Function invoked to acquire a token for the requested scopes.
   */
  constructor (private provider: (scopes: string[], options?: GetTokenOptions) => Promise<TokenResponse | undefined>) {}

  /**
   * Retrieves an access token for the specified scopes using the configured provider.
   * @param scopes Array of scopes for which to request an access token.
   * @param options Optional parameters for token retrieval.
   * @returns Promise that resolves to an access token.
   * @throws {Error} If the provider returns a null/undefined response or a response without a token.
   */
  public async getToken (scopes: string | string[], options?: GetTokenOptions): Promise<AccessToken> {
    const requestedScopes = Array.isArray(scopes) ? scopes : [scopes]
    const response = await this.provider(requestedScopes, options)
    if (!response?.token) {
      throw ExceptionHelper.generateException(Error, Errors.NullTokenResponse)
    }

    return {
      token: response.token,
      expiresOnTimestamp: Date.now() + DEFAULT_TOKEN_LIFETIME_MS
    }
  }
}
