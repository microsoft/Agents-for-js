/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a query for verifying the state during sign-in.
 */
export interface SigninStateVerificationQuery {
  /**
   * The state to be verified.
   * @type {string}
   */
  state?: string
}
