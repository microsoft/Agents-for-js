/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import jwt from 'jsonwebtoken'

/**
 * Conservative lifetime (in milliseconds) applied when the token is opaque or carries no readable
 * JWT `exp` claim.
 */
const FALLBACK_LIFETIME_MS = 5 * 60 * 1000

/**
 * Resolves the absolute expiry (epoch milliseconds) of a sidecar-issued token. Prefers the token's
 * own JWT `exp` claim; falls back to {@link FALLBACK_LIFETIME_MS} from now when the token is opaque
 * or carries no readable expiry.
 * @param token The raw access token returned by the sidecar.
 * @param now The current time in epoch milliseconds (defaults to `Date.now()`); primarily a test seam.
 * @returns The absolute UTC expiry of the token, in epoch milliseconds.
 */
export function resolveTokenExpiry (token: string, now: number = Date.now()): number {
  if (token) {
    try {
      const decoded = jwt.decode(token) as jwt.JwtPayload | null
      if (decoded && typeof decoded.exp === 'number' && decoded.exp > 0) {
        return decoded.exp * 1000
      }
    } catch {
      // Opaque / non-JWT token — fall back below.
    }
  }

  return now + FALLBACK_LIFETIME_MS
}
