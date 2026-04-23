/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity, RoleTypes } from '@microsoft/agents-activity'
import { debug } from '@microsoft/agents-telemetry'
import { AuthConfiguration, resolveAuthority } from './authConfiguration'
import { Connections } from './connections'
import { MsalTokenProvider } from './msalTokenProvider'
import { JwtPayload } from 'jsonwebtoken'

const logger = debug('agents:authorization:connections')

export interface ConnectionMapItem {
  audience?: string
  serviceUrl: string
  connection: string
}

export class MsalConnectionManager implements Connections {
  private _connections: Map<string, MsalTokenProvider>
  private _connectionsMap: ConnectionMapItem[]
  private _serviceConnectionConfiguration: AuthConfiguration
  private static readonly DEFAULT_CONNECTION = 'serviceConnection'

  constructor (
    connectionsConfigurations: Map<string, AuthConfiguration> = new Map(),
    connectionsMap: ConnectionMapItem[] = [],
    configuration: AuthConfiguration = {}) {
    this._connections = new Map()
    this._connectionsMap = connectionsMap.length > 0 ? connectionsMap : (configuration.connectionsMap || [])
    this._serviceConnectionConfiguration = {}

    const providedConnections = connectionsConfigurations.size > 0 ? connectionsConfigurations : (configuration.connections || new Map())

    for (const [name, config] of providedConnections) {
      // Instantiate MsalTokenProvider for each connection
      this._connections.set(name, new MsalTokenProvider(config))
      if (name === MsalConnectionManager.DEFAULT_CONNECTION) {
        this._serviceConnectionConfiguration = config
      }
    }

    for (const [name, provider] of this._connections.entries()) {
      const cfg = provider.connectionSettings
      const authType = cfg?.certPemFile
        ? 'certificate'
        : cfg?.clientSecret
          ? 'clientSecret'
          : cfg?.WIDAssertionFile || cfg?.FICClientId
            ? 'workloadIdentity'
            : 'none'
      logger.debug('connection "%s" clientId=%s tenantId=%s authType=%s', name, cfg?.clientId ?? '<none>', cfg?.tenantId ?? '<none>', authType)
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
  getConnection (connectionName: string): MsalTokenProvider {
    const conn = this._connections.get(connectionName)
    if (!conn) {
      throw new Error(`Connection not found: ${connectionName}`)
    }
    return this.applyConnectionDefaults(conn)
  }

  /**
   * Get the default OAuth connection for the agent.
   * @returns The default OAuth connection for the agent.
   */
  getDefaultConnection (): MsalTokenProvider {
    if (this._connections.size === 0) {
      throw new Error('No connections found for this Agent in the Connections Configuration.')
    }

    // Return the wildcard map item instance.
    for (const item of this._connectionsMap) {
      if (item.serviceUrl === '*' && !item.audience) {
        return this.getConnection(item.connection)
      }
    }

    const conn = this._connections.values().next().value as MsalTokenProvider

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
  getTokenProvider (identity: JwtPayload, serviceUrl: string): MsalTokenProvider {
    if (!identity) {
      throw new Error('Identity is required to get the token provider.')
    }

    let audience
    if (Array.isArray(identity?.aud)) {
      audience = identity.aud[0]
    } else {
      audience = identity.aud
    }

    if (!audience || !serviceUrl) throw new Error('Audience and Service URL are required to get the token provider.')

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
    throw new Error(`No connection found for audience: ${audience} and serviceUrl: ${serviceUrl}`)
  }

  /**
   * Finds a connection based on an activity's blueprint.
   * @param identity - The identity.  Usually TurnContext.identity.
   * @param activity The activity.
   * @returns The TokenProvider for the connection.
   */
  getTokenProviderFromActivity (identity: JwtPayload, activity: Activity): MsalTokenProvider {
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

  private applyConnectionDefaults (conn: MsalTokenProvider): MsalTokenProvider {
    if (conn.connectionSettings) {
      conn.connectionSettings.authority ??= 'https://login.microsoftonline.com'
      conn.connectionSettings.issuers ??= [
        'https://api.botframework.com',
        `${resolveAuthority('https://sts.windows.net', conn.connectionSettings.tenantId)}/`,
        `${resolveAuthority(conn.connectionSettings.authority, conn.connectionSettings.tenantId)}/v2.0`
      ]
    }
    return conn
  }
}
