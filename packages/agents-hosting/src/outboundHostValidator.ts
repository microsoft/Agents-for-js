/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ConfigurationContext,
  getConfigurationSnapshot
} from './configuration/configuration'
import { loadModernEnvironmentConfiguration } from './configuration/environmentConfiguration'

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

/** Configuration for the shared outbound-host allowlist. */
export interface OutboundHostValidatorOptions {
  /** Optional host-scoped external configuration. */
  configurationContext?: ConfigurationContext

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
    const resolved = options.configurationContext
      ? resolveOutboundHostValidatorOptions(options)
      : options
    this.enabled = resolved.enabled ?? false

    const suffixes = new Set<string>()
    if (resolved.includeDefaultMicrosoftHosts ?? true) {
      for (const host of DEFAULT_MICROSOFT_HOSTS) suffixes.add(host)
    }

    for (const host of resolved.hosts ?? []) {
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
  return { ...loadModernEnvironmentConfiguration().outboundHostValidator }
}

/** Creates a validator using the shared configuration precedence. */
export function createOutboundHostValidator (options: OutboundHostValidatorOptions = {}): OutboundHostValidator {
  return new OutboundHostValidator(resolveOutboundHostValidatorOptions(options))
}

function resolveOutboundHostValidatorOptions (
  options: OutboundHostValidatorOptions
): OutboundHostValidatorOptions {
  const external = getConfigurationSnapshot(options.configurationContext)
  const fromEnv = loadOutboundHostValidatorOptionsFromEnv()
  const direct: OutboundHostValidatorOptions = {}
  if (options.enabled !== undefined) direct.enabled = options.enabled
  if (options.includeDefaultMicrosoftHosts !== undefined) {
    direct.includeDefaultMicrosoftHosts = options.includeDefaultMicrosoftHosts
  }
  if (options.hosts !== undefined) direct.hosts = options.hosts
  return {
    ...external.fallback.outboundHostValidator,
    ...fromEnv,
    ...external.overrideEnvironment.outboundHostValidator,
    ...direct,
    ...external.enforce.outboundHostValidator
  }
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
