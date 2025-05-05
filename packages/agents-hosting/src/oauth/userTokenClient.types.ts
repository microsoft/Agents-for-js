// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CardAction } from '@microsoft/agents-activity'

/**
 * Represents the status of an OAuth token request.
 */
export enum TokenRequestStatus {
  /**
     * Indicates that the token request was successful.
     */
  Success = 'Success',

  /**
     * Indicates that the token request failed.
     */
  Failed = 'Failed',

  /**
     * Indicates that the token request is pending.
     */
  InProgress = 'InProgress',

  Expired = 'Expired',
}

/**
   * Represents the response containing OAuth token information.
   * This interface encapsulates all data related to an OAuth token response.
   */
export interface TokenResponse {

  status: TokenRequestStatus

  /**
     * The OAuth token string, or null if no token is available.
     */
  token: string | undefined

  /**
     * The expiration time of the token, represented as a numeric timestamp.
     */
  // expires: number
}

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
export interface SignInResource {
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

export interface TokenOrSinginResourceResponse {
  tokenResponse: TokenResponse,
  signInResource: SignInResource
}

export interface TokenStatus {
  channelId: string
  connectionName: string,
  hasToken: boolean,
  serviceProviderDisplayName: string,
}

export interface AadResourceUrls {
  resourceUrls: string[]
}
