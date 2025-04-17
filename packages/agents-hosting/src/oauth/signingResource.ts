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

/**
 * Represents a resource for posting tokens.
 */
export interface TokenPostResource {
  /**
   * The SAS URL for the token post resource.
   */
  sasUrl?: string
}

/**
 * Represents a resource for signing in.
 */
export interface SigningResource {
  /**
   * The link for signing in.
   */
  signInLink: string,
  /**
   * The resource for token exchange.
   */
  tokenExchangeResource: TokenExchangeResource,
  /**
   * The resource for token post.
   */
  tokenPostResource: TokenPostResource
}
