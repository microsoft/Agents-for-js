/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { parseBooleanEnv } from './utils/env'

/** Hosts used by Microsoft channel callbacks and hosted attachments. */
const DEFAULT_MICROSOFT_HOSTS = Object.freeze([
  'botframework.com',
  'smba.trafficmanager.net',
  'teams.microsoft.com',
  'teams.microsoft.us',
  'graph.microsoft.com',
  'sharepoint.com',
  'svc.ms',
  'blob.core.windows.net'
])

const OUTBOUND_HOST_VALIDATOR_ENV_PREFIX = 'OutboundHostValidator__'
const OUTBOUND_HOST_VALIDATOR_ENV_PREFIX_UPPER = OUTBOUND_HOST_VALIDATOR_ENV_PREFIX.toUpperCase()

/** Configuration for the shared outbound-host allowlist. */
export interface OutboundHostValidatorOptions {
  /** Enables allowlist enforcement. Defaults to `false`. */
  enabled?: boolean

  /**
   * Indicates whether the built-in list of Microsoft first-party hosts
   * (Bot Connector, Graph, SharePoint, Azure Blob/AMS) is included when enforcement is enabled.
   * Defaults to `true`.
   */
  includeDefaultMicrosoftHosts?: boolean

  /** Additional exact hosts or host suffixes to allow.
   * An entry matches a request host when the host equals the entry or is a subdomain of it (e.g. `contoso.com` matches `contoso.com` and `files.contoso.com`).
   * A leading `*.` is accepted and ignored (treated as a suffix). Ports and paths are ignored if provided.
   */
  hosts?: readonly string[]
}

/** A policy that decides whether an outbound URL is safe to request. */
export interface OutboundUrlPolicy {
  readonly enabled: boolean
  isAllowed(url: string | URL | null | undefined): boolean
}

/**
 * Shared allowlist policy for server-side outbound requests.
 *
 * A configured suffix matches both the exact host and its subdomains. The
 * policy is disabled by default to preserve existing SDK behavior.
 */
export class OutboundHostValidator implements OutboundUrlPolicy {
  public readonly enabled: boolean
  private readonly suffixes: ReadonlySet<string>

  public constructor (options: OutboundHostValidatorOptions = {}) {
    this.enabled = options.enabled ?? false

    const suffixes = new Set<string>()
    if (options.includeDefaultMicrosoftHosts ?? true) {
      for (const host of DEFAULT_MICROSOFT_HOSTS) suffixes.add(host)
    }

    for (const host of options.hosts ?? []) {
      const normalized = normalizeConfiguredHost(host)
      if (normalized) suffixes.add(normalized)
    }

    this.suffixes = suffixes
  }

  public isAllowed (input: string | URL | null | undefined): boolean {
    if (!this.enabled) return true

    const host = getUrlHost(input)
    if (!host) return false

    for (const suffix of this.suffixes) {
      if (host === suffix || host.endsWith(`.${suffix}`)) return true
    }

    return false
  }
}

/**
 * Loads validator options from environment variables compatible with the
 * .NET `OutboundHostValidator` configuration section.
 *
 * Hosts can be supplied either as a comma-separated `Hosts` value or as
 * indexed values such as `Hosts__0`, `Hosts__1`, and so on.
 */
export function loadOutboundHostValidatorOptionsFromEnv (): OutboundHostValidatorOptions {
  const result: OutboundHostValidatorOptions = {}
  const indexedHosts = new Map<number, string>()
  const hosts: string[] = []

  for (const [envKey, rawValue] of Object.entries(process.env)) {
    const upperKey = envKey.toUpperCase()
    if (!upperKey.startsWith(OUTBOUND_HOST_VALIDATOR_ENV_PREFIX_UPPER)) continue

    const property = envKey.substring(OUTBOUND_HOST_VALIDATOR_ENV_PREFIX.length)
    const upperProperty = property.toUpperCase()

    if (upperProperty === 'ENABLED') {
      const value = parseBooleanEnv(rawValue)
      if (value !== undefined) result.enabled = value
    } else if (upperProperty === 'INCLUDEDEFAULTMICROSOFTHOSTS') {
      const value = parseBooleanEnv(rawValue)
      if (value !== undefined) result.includeDefaultMicrosoftHosts = value
    } else if (upperProperty === 'HOSTS' && rawValue) {
      hosts.push(...rawValue.split(',').map(host => host.trim()).filter(Boolean))
    } else {
      const match = /^HOSTS__(\d+)$/i.exec(property)
      if (match && rawValue?.trim()) indexedHosts.set(Number(match[1]), rawValue.trim())
    }
  }

  for (const [, host] of [...indexedHosts.entries()].sort(([left], [right]) => left - right)) {
    hosts.push(host)
  }
  if (hosts.length > 0) result.hosts = hosts

  return result
}

/** Creates the default validator, with explicit settings overriding the environment. */
export function createOutboundHostValidator (options?: OutboundHostValidatorOptions): OutboundHostValidator {
  const fromEnv = loadOutboundHostValidatorOptionsFromEnv()
  return new OutboundHostValidator({
    enabled: options?.enabled ?? fromEnv.enabled,
    includeDefaultMicrosoftHosts: options?.includeDefaultMicrosoftHosts ?? fromEnv.includeDefaultMicrosoftHosts,
    hosts: options?.hosts ?? fromEnv.hosts
  })
}

function getUrlHost (input: string | URL | null | undefined): string | undefined {
  if (!input) return undefined

  try {
    const url = input instanceof URL ? input : new URL(input)
    return normalizeHostname(url.hostname)
  } catch {
    return undefined
  }
}

function normalizeConfiguredHost (input: string): string | undefined {
  let candidate = input?.trim()
  if (!candidate) return undefined
  if (candidate.startsWith('*.')) candidate = candidate.slice(2)

  try {
    const absolute = new URL(candidate)
    if (absolute.hostname) return normalizeHostname(absolute.hostname)
  } catch {
    // A bare host, host:port, or host/path is handled below.
  }

  try {
    return normalizeHostname(new URL(`http://${candidate}`).hostname)
  } catch {
    return undefined
  }
}

function normalizeHostname (host: string): string | undefined {
  const normalized = host.trim().toLowerCase().replace(/\.$/, '')
  return normalized || undefined
}
