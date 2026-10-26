/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { promises as dns } from 'node:dns'
import { isIP } from 'node:net'
import { debug } from '@microsoft/agents-telemetry'
import { isBlockedOutboundAddress } from './ipAddress'

const logger = debug('agents:outboundHostValidator')

export function getHttpsUrl (input: string | URL | null | undefined): URL | undefined {
  if (!input) return undefined
  try {
    const url = input instanceof URL ? input : new URL(input)
    return url.protocol === 'https:' && !url.username && !url.password ? url : undefined
  } catch {
    return undefined
  }
}

export function isLocalOrBlockedHost (host: string): boolean {
  const unwrapped = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host
  return host === 'localhost' || host.endsWith('.localhost') ||
    (isIP(unwrapped) !== 0 && isBlockedOutboundAddress(unwrapped))
}

export async function hasAllowedOutboundAddresses (url: URL, allowPrivateNetworkAddresses = false): Promise<boolean> {
  if (allowPrivateNetworkAddresses) return true
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '')
  if (isLocalOrBlockedHost(host)) return false
  if (isIP(host) !== 0) return true

  try {
    const addresses = await dns.lookup(host, { all: true })
    return addresses.length > 0 && addresses.every(({ address }) => !isBlockedOutboundAddress(address))
  } catch {
    logger.warn(`Attachment destination DNS lookup failed. Host='${host}'`)
    return false
  }
}
