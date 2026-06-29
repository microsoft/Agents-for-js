import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import jwt from 'jsonwebtoken'
import { resolveTokenExpiry } from '../../src/auth/sidecar/sidecarTokenExpiry'

const FALLBACK_LIFETIME_MS = 5 * 60 * 1000
const NOW = 1_700_000_000_000

describe('resolveTokenExpiry', () => {
  it('uses the JWT exp claim when present', () => {
    const expSeconds = Math.floor(NOW / 1000) + 3600
    const token = jwt.sign({ exp: expSeconds }, 'secret')
    assert.strictEqual(resolveTokenExpiry(token, NOW), expSeconds * 1000)
  })

  it('falls back to the conservative lifetime for an opaque (non-JWT) token', () => {
    assert.strictEqual(resolveTokenExpiry('an-opaque-token', NOW), NOW + FALLBACK_LIFETIME_MS)
  })

  it('falls back when the JWT carries no exp claim', () => {
    const token = jwt.sign({ sub: 'agent' }, 'secret')
    assert.strictEqual(resolveTokenExpiry(token, NOW), NOW + FALLBACK_LIFETIME_MS)
  })

  it('falls back when the exp claim is non-positive', () => {
    const token = jwt.sign({ exp: 0, sub: 'agent' }, 'secret')
    assert.strictEqual(resolveTokenExpiry(token, NOW), NOW + FALLBACK_LIFETIME_MS)
  })

  it('falls back for an empty token', () => {
    assert.strictEqual(resolveTokenExpiry('', NOW), NOW + FALLBACK_LIFETIME_MS)
  })
})
