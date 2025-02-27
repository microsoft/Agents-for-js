// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents a request for exchanging tokens.
 */
export interface TokenExchangeRequest {
  /**
   * The URI for the token exchange request.
   */
  uri?: string
  /**
   * The token to be exchanged.
   */
  token?: string
  /**
   * The ID associated with the token exchange request.
   */
  id?: string
}
