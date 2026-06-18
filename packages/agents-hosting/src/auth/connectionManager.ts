/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, ExceptionHelper, RoleTypes } from '@microsoft/agents-activity'
import { debug, redactString } from '@microsoft/agents-telemetry'
import { AuthConfiguration, AuthType } from './authConfiguration'
import { Connections } from './connections'
import { AuthProvider } from './authProvider'
import { MsalTokenProvider } from './msal/msalTokenProvider'
import { SidecarAuthProvider } from './sidecar/sidecarAuthProvider'
import { JwtPayload } from 'jsonwebtoken'
import { Errors } from '../errorHelper'
import type { ConnectionMapItem } from './settings'

const logger = debug('agents:authorization:connections')

/**
 * Factory function that creates an {@link AuthProvider} instance from a connection's
 * {@link AuthConfiguration}.
 */
export type AuthProviderFactory = (config: AuthConfiguration) => AuthProvider

/**
 * Default {@link AuthProviderFactory} that dispatches per-connection by `authType`: connections with
 * `authType` set to `EntraAuthSideCar` use {@link SidecarAuthProvider}; all others use
 * {@link MsalTokenProvider}.
 * @param config The connection authentication configuration.
 * @returns The auth provider for the connection.
 */
export const defaultAuthProviderFactory: AuthProviderFactory = (config: AuthConfiguration): AuthProvider =>
  config?.authType === AuthType.EntraAuthSideCar
    ? new SidecarAuthProvider(config)
    : new MsalTokenProvider(config)

/**
 * Generic, provider-agnostic connection manager. Dispatches connections to any {@link AuthProvider}
 * implementation produced by the supplied {@link AuthProviderFactory}, while owning the
 * provider-independent connection routing logic (audience matching, service URL dispatch,
 * `altBlueprintConnectionName` handling, default connection resolution).
 */
export class ConnectionManager implements Connections {
  protected _connections: Map<string, AuthProvider>
  protected _connectionsMap: ConnectionMapItem[]
  protected _serviceConnectionConfiguration: AuthConfiguration
  protected static readonly DEFAULT_CONNECTION = 'serviceConnection'

  /**
   * Creates a new {@link ConnectionManager}.
   * @param providerFactory Factory used to instantiate an {@link AuthProvider} for each connection.
   * @param connectionsConfigurations Map of connection names to their authentication configurations.
   * @param connectionsMap Map items used to route activities to connections.
   * @param configuration Fallback authentication configuration (used when the above are empty).
   */
  constructor (
    providerFactory: AuthProviderFactory = defaultAuthProviderFactory,
    connectionsConfigurations: Map<string, AuthConfiguration> = new Map(),
    connectionsMap: ConnectionMapItem[] = [],
    configuration: AuthConfiguration = {}) {
    this._connections = new Map()
    this._connectionsMap = connectionsMap.length > 0 ? connectionsMap : (configuration.connectionsMap || [])
    this._serviceConnectionConfiguration = {}

    const providedConnections = connectionsConfigurations.size > 0 ? connectionsConfigurations : (configuration.connections || new Map())

    for (const [name, config] of providedConnections) {
      this._connections.set(name, providerFactory(config))
      if (name === ConnectionManager.DEFAULT_CONNECTION) {
        this._serviceConnectionConfiguration = config
      }
    }

    for (const [name, provider] of this._connections.entries()) {
      const cfg = provider.connectionSettings
      const authType = cfg?.authType ??
        (cfg?.certPemFile
          ? AuthType.Certificate
          : cfg?.clientSecret
            ? AuthType.ClientSecret
            : cfg?.WIDAssertionFile
              ? AuthType.WorkloadIdentity
              : cfg?.federatedClientId || cfg?.FICClientId
                ? AuthType.FederatedCredentials
                : 'none')
      logger.debug('connection "%s" clientId=%s tenantId=%s authType=%s', name, redactString(cfg?.clientId, true) ?? '<none>', redactString(cfg?.tenantId, true) ?? '<none>', authType)
    }

    for (const item of this._connectionsMap) {
      logger.debug('connectionsMap: %s -> %s audience=%s', item.serviceUrl, item.connection, item.audience ?? '')
    }
  }

  /**
   * Get the OAuth connection for the agent.
   * @param connectionName The name of the connection.
   * @returns The OAuth connection for the agent.
   */
  getConnection (connectionName: string): AuthProvider {
    const conn = this._connections.get(connectionName)
    if (!conn) {
      throw ExceptionHelper.generateException(Error, Errors.ConnectionNotFound, undefined, { connectionName })
    }
    return this.applyConnectionDefaults(conn)
  }

  /**
   * Get the default OAuth connection for the agent.
   * @returns The default OAuth connection for the agent.
   */
  getDefaultConnection (): AuthProvider {
    if (this._connections.size === 0) {
      throw ExceptionHelper.generateException(Error, Errors.NoConnectionsFoundInConfiguration)
    }

    // Return the wildcard map item instance.
    for (const item of this._connectionsMap) {
      if (item.serviceUrl === '*' && !item.audience) {
        return this.getConnection(item.connection)
      }
    }

    const conn = this._connections.values().next().value as AuthProvider

    return this.applyConnectionDefaults(conn)
  }

  /**
   * Finds a connection based on a map.
   *
   * @param identity - The identity.  Usually TurnContext.identity.
   * @param serviceUrl The service URL.
   * @returns The TokenProvider for the connection.
   *
   * @remarks
   * Example environment variables:
   * connectionsMap__0__connection=seviceConnection
   * connectionsMap__0__serviceUrl=http://*..botframework.com/*
   * connectionsMap__0__audience=optional
   * connectionsMap__1__connection=agentic
   * connectionsMap__1__serviceUrl=agentic
   *
   * ServiceUrl is:  A regex to match with, or "*" for any serviceUrl value.
   * Connection is: A name in the 'Connections' list.
   */
  getTokenProvider (identity: JwtPayload, serviceUrl: string): AuthProvider {
    if (!identity) {
      throw ExceptionHelper.generateException(Error, Errors.IdentityRequiredForTokenProvider)
    }

    let audience
    if (Array.isArray(identity?.aud)) {
      audience = identity.aud[0]
    } else {
      audience = identity.aud
    }

    if (!audience || !serviceUrl) throw ExceptionHelper.generateException(Error, Errors.AudienceAndServiceUrlRequiredForTokenProvider)

    if (this._connectionsMap.length === 0) {
      logger.debug('no connectionsMap, using default connection for serviceUrl=%s', serviceUrl)
      return this.getDefaultConnection()
    }

    for (const item of this._connectionsMap) {
      let audienceMatch = true

      // if we have an audience to match against, match it.
      if (item.audience && audience) {
        audienceMatch = item.audience === audience
      }

      if (audienceMatch) {
        if (item.serviceUrl === '*' || !item.serviceUrl) {
          logger.debug('connection "%s" matched (wildcard/no serviceUrl) for audience=%s', item.connection, audience)
          return this.getConnection(item.connection)
        }

        const regex = new RegExp(item.serviceUrl, 'i')
        if (regex.test(serviceUrl)) {
          logger.debug('connection "%s" matched serviceUrl=%s for audience=%s', item.connection, serviceUrl, audience)
          return this.getConnection(item.connection)
        }
      }
    }
    throw ExceptionHelper.generateException(Error, Errors.NoConnectionForAudienceAndServiceUrl, undefined, { audience: String(audience), serviceUrl })
  }

  /**
   * Finds a connection based on an activity's blueprint.
   * @param identity - The identity.  Usually TurnContext.identity.
   * @param activity The activity.
   * @returns The TokenProvider for the connection.
   */
  getTokenProviderFromActivity (identity: JwtPayload, activity: Activity): AuthProvider {
    let connection = this.getTokenProvider(identity, activity.serviceUrl || '')

    // This is for the case where the Agentic BlueprintId is not the same as the AppId
    if (connection &&
      (activity.recipient?.role === RoleTypes.AgenticIdentity ||
        activity.recipient?.role === RoleTypes.AgenticUser)) {
      if (connection.connectionSettings?.altBlueprintConnectionName &&
          connection.connectionSettings.altBlueprintConnectionName.trim() !== '') {
        connection = this.getConnection(connection.connectionSettings?.altBlueprintConnectionName as string)
      }
    }
    return connection
  }

  /**
   * Get the default connection configuration for the agent.
   * @returns The default connection configuration for the agent.
   */
  getDefaultConnectionConfiguration (): AuthConfiguration {
    return this._serviceConnectionConfiguration
  }

  /**
   * Applies provider-specific defaults to a resolved connection before returning it. The generic
   * base performs no mutation; provider-specific managers may override this.
   * @param conn The resolved auth provider.
   * @returns The auth provider, possibly with defaults applied.
   */
  protected applyConnectionDefaults (conn: AuthProvider): AuthProvider {
    return conn
  }
}
