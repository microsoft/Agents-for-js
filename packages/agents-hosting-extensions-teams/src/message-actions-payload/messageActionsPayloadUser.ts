/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Defines the type of user identity in the message actions payload.
 * - `aadUser`: Represents an Azure Active Directory user.
 * - `onPremiseAadUser`: Represents an on-premises Azure Active Directory user.
 * - `anonymousGuest`: Represents an anonymous guest user.
 * - `federatedUser`: Represents a federated user.
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
