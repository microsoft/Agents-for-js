/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface Claim {
  readonly type: string;
  readonly value: string;
}

export class ClaimsIdentity {
  constructor (public readonly claims: Claim[], private readonly authenticationType?: string | boolean) {}

  get isAuthenticated (): boolean {
    if (typeof this.authenticationType === 'boolean') {
      return this.authenticationType
    }

    return this.authenticationType != null
  }

  getClaimValue (claimType: string): string | null {
    const claim = this.claims.find((c) => c.type === claimType)

    return claim?.value ?? null
  }
}
