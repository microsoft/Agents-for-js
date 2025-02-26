/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type UserIdentityType = 'aadUser' | 'onPremiseAadUser' | 'anonymousGuest' | 'federatedUser'

export interface MessageActionsPayloadUser {
  userIdentityType?: UserIdentityType
  id?: string
  displayName?: string
}
