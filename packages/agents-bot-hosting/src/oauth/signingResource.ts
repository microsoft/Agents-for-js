// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TokenExchangeResource } from './tokenExchangeResource'
import { TokenPostResource } from './tokenPostResource'

/**
 * Represents a resource for signing in.
 */
export interface SigningResource {
  /**
   * The link for signing in.
   */
  singingLink: string,
  /**
   * The resource for token exchange.
   */
  tokenExchangeResource: TokenExchangeResource,
  /**
   * The resource for token post.
   */
  tokenPostResource: TokenPostResource
}
