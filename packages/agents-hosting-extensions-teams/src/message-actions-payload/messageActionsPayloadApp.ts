/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The type of application identity.
 */
export type ApplicationIdentityType = 'aadApplication' | 'bot' | 'tenantBot' | 'office365Connector' | 'webhook'

/**
 * Represents an application in the message actions payload.
 */
export interface MessageActionsPayloadApp {
  /**
   * The type of application identity.
   */
  applicationIdentityType?: ApplicationIdentityType
  /**
   * The unique identifier of the application.
   */
  id?: string
  /**
   * The display name of the application.
   */
  displayName?: string
}
