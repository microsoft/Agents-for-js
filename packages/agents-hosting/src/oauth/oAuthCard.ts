// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '@microsoft/agents-activity'
import { TokenExchangeResource, TokenPostResource } from './signingResource'
/**
 * Represents an OAuth card.
 */
export interface OAuthCard {
  /**
   * The buttons associated with the OAuth card.
   */
  buttons: CardAction[]
  /**
   * The connection name for the OAuth card.
   */
  connectionName: string
  /**
   * The text content of the OAuth card.
   */
  text: string
  /**
   * The token exchange resource for the OAuth card.
   */
  tokenExchangeResource: TokenExchangeResource
  /**
   * The token post resource for the OAuth card.
   */
  tokenPostResource: TokenPostResource
}
