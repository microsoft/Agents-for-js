// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents a resource for exchanging tokens.
 */
export interface TokenExchangeResource {
  /**
   * The ID of the token exchange resource.
   */
  id?: string
  /**
   * The URI of the token exchange resource.
   */
  uri?: string
  /**
   * The provider ID for the token exchange resource.
   */
  providerId?: string
}
