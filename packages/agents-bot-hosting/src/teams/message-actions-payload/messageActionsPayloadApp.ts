/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type ApplicationIdentityType = 'aadApplication' | 'bot' | 'tenantBot' | 'office365Connector' | 'webhook'

export interface MessageActionsPayloadApp {
  applicationIdentityType?: ApplicationIdentityType
  id?: string
  displayName?: string
}
