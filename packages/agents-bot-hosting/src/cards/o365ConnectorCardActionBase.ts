/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type O365ConnectorCardActionType = 'ViewAction' | 'OpenUri' | 'HttpPOST' | 'ActionCard'

/**
 * Represents a base action in an O365 connector card.
 */
export interface O365ConnectorCardActionBase {
  /**
   * The type of the action.
   */
  '@type'?: O365ConnectorCardActionType;
  /**
   * The name of the action.
   */
  name?: string;
  /**
   * The ID of the action.
   */
  '@id'?: string;
}
