/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration, resolveAuthority } from '../authConfiguration'
import type { ConnectionMapItem } from '../settings'
import { AuthProvider } from '../authProvider'
import { ConnectionManager, defaultAuthProviderFactory } from '../connectionManager'

/**
 * Connection manager backed by MSAL (and, for `EntraAuthSideCar` connections, the Entra sidecar
 * provider). A thin convenience subclass of {@link ConnectionManager} that supplies the default
 * provider factory and applies MSAL-specific connection defaults.
 */
export class MsalConnectionManager extends ConnectionManager {
  /**
   * Creates an MSAL connection manager.
   *
   * @param connectionsConfigurations - Authentication settings keyed by connection name.
   * @param connectionsMap - Rules that map service URLs and audiences to connections.
   * @param configuration - Default authentication configuration.
   */
  constructor (
    connectionsConfigurations: Map<string, AuthConfiguration> = new Map(),
    connectionsMap: ConnectionMapItem[] = [],
    configuration: AuthConfiguration = {}) {
    super(defaultAuthProviderFactory, connectionsConfigurations, connectionsMap, configuration)
  }

  protected applyConnectionDefaults (conn: AuthProvider): AuthProvider {
    if (conn.connectionSettings) {
      conn.connectionSettings.authorityEndpoint ??= conn.connectionSettings.authority || 'https://login.microsoftonline.com'
      conn.connectionSettings.authority ??= conn.connectionSettings.authorityEndpoint
      conn.connectionSettings.issuers ??= [
        'https://api.botframework.com',
        `${resolveAuthority('https://sts.windows.net', conn.connectionSettings.tenantId)}/`,
        `${resolveAuthority(conn.connectionSettings.authorityEndpoint, conn.connectionSettings.tenantId)}/v2.0`
      ]
      // For backward compatibility
      if (conn.connectionSettings.federatedClientId) {
        conn.connectionSettings.FICClientId = conn.connectionSettings.federatedClientId
      }

      if (conn.connectionSettings.scopes?.length) {
        conn.connectionSettings.scope = conn.connectionSettings.scopes?.[0]
      }

      if (conn.connectionSettings.authorityEndpoint) {
        conn.connectionSettings.authority = conn.connectionSettings.authorityEndpoint
      }

      // .NET parity alias: keep altBlueprintConnectionName and alternateBlueprintConnectionName in sync.
      conn.connectionSettings.altBlueprintConnectionName ??= conn.connectionSettings.alternateBlueprintConnectionName
      if (conn.connectionSettings.altBlueprintConnectionName) {
        conn.connectionSettings.alternateBlueprintConnectionName = conn.connectionSettings.altBlueprintConnectionName
      }
    }

    return conn
  }
}
