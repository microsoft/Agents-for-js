// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

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
