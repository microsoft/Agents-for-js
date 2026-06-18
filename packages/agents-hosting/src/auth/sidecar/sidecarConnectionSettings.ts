/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectionSettingsBase } from '../settings'

/**
 * Connection settings for the Entra Agent ID sidecar (agent container) authentication provider, used when a
 * connection's `authType` is `'EntraAuthSideCar'`.
 *
 * @remarks
 * Mirrors the .NET `Microsoft.Agents.Authentication.EntraAuthSidecar.Model.SidecarConnectionSettings`
 * class, which likewise derives from `ConnectionSettingsBase`. These are the configuration-level
 * properties; they are normalized (with defaults applied) before use by the sidecar token provider.
 */
export interface SidecarConnectionSettings extends ConnectionSettingsBase {
  /**
   * Optional base URL of the Entra Agent ID sidecar (agent container).
   *
   * @remarks
   * Only used when `authType` is `'EntraAuthSideCar'`. Resolution order:
   * `SIDECAR_URL` environment variable > this setting > `http://localhost:5178`.
   * Regardless of how it is resolved, the host must be a loopback/private address
   * unless `bypassLocalNetworkRestriction` is set.
   */
  sidecarBaseUrl?: string

  /**
   * The configured downstream API service name in the sidecar's DownstreamApis configuration.
   *
   * @remarks
   * Only used when `authType` is `'EntraAuthSideCar'`. Defaults to `'default'`.
   */
  serviceName?: string

  /**
   * The sidecar downstream API name used to acquire the Blueprint (agent application) token for the
   * agentic FIC chain.
   *
   * @remarks
   * Only used when `authType` is `'EntraAuthSideCar'`. Defaults to `'agenticblueprint'`. This
   * downstream API must be configured app-only with the `api://AzureAdTokenExchange/.default` scope.
   */
  blueprintServiceName?: string

  /**
   * When `true`, disables the loopback/private-address safety check on the resolved sidecar base URL.
   *
   * @remarks
   * UNSAFE. Leave this `false` in all normal deployments. Only enable it for a carefully validated
   * private-network configuration where the sidecar is reachable at a non-private address that the
   * operator explicitly trusts. Only used when `authType` is `'EntraAuthSideCar'`.
   */
  bypassLocalNetworkRestriction?: boolean

  /**
   * HTTP request timeout (in milliseconds) for sidecar calls.
   *
   * @remarks
   * Only used when `authType` is `'EntraAuthSideCar'`. Defaults to 30000 (30 seconds).
   */
  requestTimeout?: number

  /**
   * Number of retry attempts for transient sidecar failures (5xx, 408, 429, network/timeout).
   *
   * @remarks
   * Only used when `authType` is `'EntraAuthSideCar'`. Defaults to 3.
   */
  retryCount?: number
}
