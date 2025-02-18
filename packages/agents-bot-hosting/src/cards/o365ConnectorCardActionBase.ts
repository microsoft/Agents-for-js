/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type O365ConnectorCardActionType = 'ViewAction' | 'OpenUri' | 'HttpPOST' | 'ActionCard'

export interface O365ConnectorCardActionBase {
  '@type'?: O365ConnectorCardActionType
  name?: string
  '@id'?: string
}
