/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The type of user identity.
 */
export type UserIdentityType = 'aadUser' | 'onPremiseAadUser' | 'anonymousGuest' | 'federatedUser'

/**
 * Represents a user in the message actions payload.
 */
export interface MessageActionsPayloadUser {
  /**
   * The type of user identity.
   */
  userIdentityType?: UserIdentityType
  /**
   * The unique identifier of the user.
   */
  id?: string
  /**
   * The display name of the user.
   */
  displayName?: string
}
