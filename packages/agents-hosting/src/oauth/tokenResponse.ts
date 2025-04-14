// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents the response containing OAuth token information.
 * This interface encapsulates all data related to an OAuth token response.
 */
export interface TokenResponse {
  /**
   * The ID of the channel associated with this token.
   */
  channelId: string,

  /**
   * The name of the connection used to obtain the token.
   */
  connectionName: string,

  /**
   * The OAuth token string, or null if no token is available.
   */
  token: string | null,

  /**
   * The expiration time of the token, represented as a numeric timestamp.
   */
  expires: number
}
