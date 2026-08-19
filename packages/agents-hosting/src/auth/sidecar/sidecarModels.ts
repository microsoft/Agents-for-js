/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from '../authConfiguration'

/**
 * Default sidecar downstream API name used for app-only and autonomous agent token acquisition.
 */
const DEFAULT_SERVICE_NAME = 'default'

/**
 * Default sidecar downstream API name used to acquire the Blueprint (agent application) token.
 */
const DEFAULT_BLUEPRINT_SERVICE_NAME = 'agenticblueprint'

/**
 * Default base URL of the Entra Agent ID sidecar (agent container).
 */
export const DEFAULT_SIDECAR_BASE_URL = 'http://localhost:5178'

/**
 * Default per-attempt HTTP request timeout (in milliseconds) for sidecar calls.
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 30000

/**
 * Default number of retry attempts for transient sidecar failures.
 */
export const DEFAULT_RETRY_COUNT = 3

/**
 * Resolved (normalized) connection settings for the sidecar-based token provider, derived from a
 * connection's {@link AuthConfiguration} with all sidecar defaults applied. Distinct from the
 * configuration-level {@link SidecarConnectionSettings} (which has optional properties): this is the
 * runtime shape consumed by the provider after normalization via {@link toSidecarConnectionSettings}.
 */
export interface ResolvedSidecarConnectionSettings {
  /**
   * The configured downstream API service name in the sidecar's DownstreamApis configuration.
   * Defaults to `'default'`.
   */
  serviceName: string

  /**
   * The sidecar downstream API name used to acquire the Blueprint (agent application) token for the
   * agentic FIC chain. Defaults to `'agenticblueprint'`.
   */
  blueprintServiceName: string

  /**
   * Optional base URL of the Entra Agent ID sidecar (agent container). Resolution order:
   * `SIDECAR_URL` environment variable > this setting > {@link DEFAULT_SIDECAR_BASE_URL}.
   */
  sidecarBaseUrl?: string

  /**
   * When `true`, disables the loopback/private-address safety check on the resolved sidecar base
   * URL. UNSAFE; leave `false` in all normal deployments.
   */
  bypassLocalNetworkRestriction: boolean

  /**
   * Per-attempt HTTP request timeout (in milliseconds) for sidecar calls. Defaults to 30000.
   */
  requestTimeout: number

  /**
   * Number of retry attempts for transient sidecar failures. Defaults to 3.
   */
  retryCount: number

  /**
   * The OAuth scopes to request, used to override the sidecar's configured downstream API scopes.
   */
  scopes?: string[]
}

/**
 * Builds a {@link ResolvedSidecarConnectionSettings} from a connection's {@link AuthConfiguration},
 * applying the documented defaults.
 * @param config The connection authentication configuration.
 * @returns The resolved sidecar connection settings.
 */
export function toSidecarConnectionSettings (config?: AuthConfiguration): ResolvedSidecarConnectionSettings {
  const scopes = config?.scopes ?? (config?.scope ? [config.scope] : undefined)
  return {
    serviceName: config?.serviceName?.trim() ? config.serviceName : DEFAULT_SERVICE_NAME,
    blueprintServiceName: config?.blueprintServiceName?.trim() ? config.blueprintServiceName : DEFAULT_BLUEPRINT_SERVICE_NAME,
    sidecarBaseUrl: config?.sidecarBaseUrl,
    bypassLocalNetworkRestriction: config?.bypassLocalNetworkRestriction ?? false,
    requestTimeout: config?.requestTimeout ?? DEFAULT_REQUEST_TIMEOUT_MS,
    retryCount: config?.retryCount ?? DEFAULT_RETRY_COUNT,
    scopes
  }
}

/**
 * Options used to build the query string for a sidecar token request. Mirrors the C#
 * `SidecarRequestOptions` shape.
 */
export interface SidecarRequestOptions {
  /** Agent app (client) ID for agent identity flows. Maps to `AgentIdentity`. */
  agentIdentity?: string

  /** Agentic user principal name for delegated agent flows. Maps to `AgentUsername`. */
  agentUsername?: string

  /** Agentic user object ID for delegated agent flows. Maps to `AgentUserId`. */
  agentUserId?: string

  /** Override the configured downstream API scopes. Maps to `optionsOverride.Scopes`. */
  scopes?: string[]

  /**
   * Request an app-only token instead of a user (delegated) token. Maps to
   * `optionsOverride.RequestAppToken=true`.
   */
  requestAppToken?: boolean

  /** Override the tenant ID. Maps to `optionsOverride.AcquireTokenOptions.Tenant`. */
  tenant?: string

  /**
   * Force a fresh token acquisition, bypassing the sidecar cache. Maps to
   * `optionsOverride.AcquireTokenOptions.ForceRefresh=true`.
   */
  forceRefresh?: boolean
}

/**
 * Result of a successful sidecar token acquisition. Mirrors the C# `SidecarTokenResult` shape.
 */
export interface SidecarTokenResult {
  /** The authorization scheme (e.g., `'Bearer'` or `'PoP'`). */
  scheme: string

  /** The raw access token. */
  token: string
}

/**
 * RFC 7807 problem details returned by the sidecar on error. Mirrors the C# `SidecarProblemDetails`
 * shape.
 */
export interface SidecarProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
}
