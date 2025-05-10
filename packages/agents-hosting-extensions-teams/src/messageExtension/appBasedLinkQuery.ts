/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a query for an app-based link.
 */
export interface AppBasedLinkQuery {
  /**
   * The URL of the link.
   * @type {string}
   */
  url?: string
  /**
   * The state associated with the link.
   * @type {string}
   */
  state?: string
}
