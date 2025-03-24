/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a query for an O365 connector card action.
 */
export interface O365ConnectorCardActionQuery {
  /**
   * The body of the action query.
   * @type {string}
   */
  body?: string
  /**
   * The ID of the action.
   * @type {string}
   */
  actionId?: string
}
