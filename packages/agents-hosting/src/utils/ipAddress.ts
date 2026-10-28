/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { isIP } from 'node:net'

function normalizeAddress (address: string): string | undefined {
  const unwrapped = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address
  const version = isIP(unwrapped)
  if (version === 0) return undefined
  return version === 6 ? new URL(`http://[${unwrapped}]`).hostname.slice(1, -1) : unwrapped
}

function mappedIPv4 (address: string): string | undefined {
  const match = address.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
  if (!match) return undefined
  const high = parseInt(match[1], 16)
  const low = parseInt(match[2], 16)
  return `${high >> 8}.${high & 0xff}.${low >> 8}.${low & 0xff}`
}

export function isPrivateOrLoopbackAddress (address: string): boolean {
  const normalized = normalizeAddress(address)
  if (!normalized) return false
  const ipv4 = mappedIPv4(normalized) ?? normalized
  if (isIP(ipv4) === 4) {
    const bytes = ipv4.split('.').map(Number)
    return bytes[0] === 127 ||
      bytes[0] === 10 ||
      (bytes[0] === 172 && bytes[1] >= 16 && bytes[1] <= 31) ||
      (bytes[0] === 192 && bytes[1] === 168) ||
      (bytes[0] === 169 && bytes[1] === 254)
  }

  if (normalized === '::1') return true
  const firstHextet = parseInt(normalized.split(':')[0], 16)
  return (firstHextet & 0xfe00) === 0xfc00 ||
    (firstHextet & 0xffc0) === 0xfe80 ||
    (firstHextet & 0xffc0) === 0xfec0
}

export function isBlockedOutboundAddress (address: string): boolean {
  const normalized = normalizeAddress(address)
  if (!normalized) return true
  const ipv4 = mappedIPv4(normalized) ?? normalized
  const [first, second] = ipv4.split('.').map(Number)
  // RFC 6598 shared space is outbound-only; it must not become trusted sidecar space.
  return normalized === '::' ||
    ipv4 === '0.0.0.0' ||
    (first === 100 && second >= 64 && second <= 127) ||
    isPrivateOrLoopbackAddress(normalized)
}
