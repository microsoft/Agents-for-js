/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents a claim with a type and value.
 */
export interface Claim {
  readonly type: string;
  readonly value: string;
}

/**
 * Represents an identity with a collection of claims.
 */
export class ClaimsIdentity {
  /**
   * Creates a new instance of the ClaimsIdentity class.
   * @param claims The collection of claims associated with the identity.
   * @param authenticationType The type of authentication used, or a boolean indicating if the identity is authenticated.
   */
  constructor (public readonly claims: Claim[], private readonly authenticationType?: string | boolean) {}

  /**
   * Indicates whether the identity is authenticated.
   * @returns True if the identity is authenticated; otherwise, false.
   */
  get isAuthenticated (): boolean {
    if (typeof this.authenticationType === 'boolean') {
      return this.authenticationType
    }

    return this.authenticationType != null
  }

  /**
   * Gets the value of a claim by its type.
   * @param claimType The type of the claim to retrieve.
   * @returns The value of the claim, or null if the claim is not found.
   */
  getClaimValue (claimType: string): string | null {
    const claim = this.claims.find((c) => c.type === claimType)

    return claim?.value ?? null
  }
}
