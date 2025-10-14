/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-activity/logger'
import { ConnectionMapItem } from './msalConnectionManager'
import objectPath from 'object-path'
import { Connections } from './connections'

const logger = debug('agents:authConfiguration')
const DEFAULT_CONNECTION = 'serviceConnection'

/**
 * Represents the authentication configuration.
 */
export interface AuthConfiguration {
  /**
   * The tenant ID for the authentication configuration.
   */
  tenantId?: string

  /**
   * The client ID for the authentication configuration. Required in production.
   */
  clientId?: string

  /**
   * The client secret for the authentication configuration.
   */
  clientSecret?: string

  /**
   * The path to the certificate PEM file.
   */
  certPemFile?: string

  /**
   * The path to the certificate key file.
   */
  certKeyFile?: string

  /**
   * A list of valid issuers for the authentication configuration.
   */
  issuers?: string[]

  /**
   * The connection name for the authentication configuration.
   */
  connectionName?: string

  /**
   * The FIC (First-Party Integration Channel) client ID.
   */
  FICClientId?: string,

  /**
   * Entra Authentication Endpoint to use.
   *
   * @remarks
   * If not populated the Entra Public Cloud endpoint is assumed.
   * This example of Public Cloud Endpoint is https://login.microsoftonline.com
   * see also https://learn.microsoft.com/entra/identity-platform/authentication-national-cloud
   */
  authority?: string

  /**
   * A map of connection names to their respective authentication configurations.
   */
  connections?: Map<string, AuthConfiguration>

  /**
   * A list of connection map items to map service URLs to connection names.
   */
  connectionsMap?: ConnectionMapItem[],

  /**
   * An optional alternative blueprint Connection name used when constructing a connector client.
   */
  altBlueprintConnectionName?: string
}

/**
 * Loads the authentication configuration from environment variables.
 *
 * @returns The authentication configuration.
 * @throws Will throw an error if clientId is not provided in production.
 *
 * @remarks
 * - `clientId` is required
 *
 * @example
 * ```
 * tenantId=your-tenant-id
 * clientId=your-client-id
 * clientSecret=your-client-secret
 *
 * certPemFile=your-cert-pem-file
 * certKeyFile=your-cert-key-file
 *
 * FICClientId=your-FIC-client-id
 *
 * connectionName=your-connection-name
 * authority=your-authority-endpoint
 * ```
 *
 */
export const loadAuthConfigFromEnv = (cnxName?: string): AuthConfiguration => {
  const envConnections = loadConnectionsMapFromEnv()
  let authConfig: AuthConfiguration

  if (envConnections.connectionsMap.length === 0) {
    // No connections provided, we need to populate the connections map with the old config settings
    authConfig = buildLegacyAuthConfig(cnxName)
    envConnections.connections.set(DEFAULT_CONNECTION, authConfig)
    envConnections.connectionsMap.push({
      serviceUrl: '*',
      connection: DEFAULT_CONNECTION,
    })
  } else {
    // There are connections provided, use the default or specified connection
    if (cnxName) {
      const entry = envConnections.connections.get(cnxName)
      if (entry) {
        authConfig = entry
      } else {
        throw new Error(`Connection "${cnxName}" not found in environment.`)
      }
    } else {
      const defaultItem = envConnections.connectionsMap.find((item) => item.serviceUrl === '*')
      const defaultConn = defaultItem ? envConnections.connections.get(defaultItem.connection) : undefined
      if (!defaultConn) {
        throw new Error('No default connection found in environment connections.')
      }
      authConfig = defaultConn
    }

    authConfig.authority ??= 'https://login.microsoftonline.com'
    authConfig.issuers ??= getDefaultIssuers(authConfig.tenantId ?? '', authConfig.authority)
  }

  return {
    ...authConfig,
    ...envConnections,
  }
}

/**
 * Loads the agent authentication configuration from previous version environment variables.
 *
 * @returns The agent authentication configuration.
 * @throws Will throw an error if MicrosoftAppId is not provided in production.
 *
 * @example
 * ```
 * MicrosoftAppId=your-client-id
 * MicrosoftAppPassword=your-client-secret
 * MicrosoftAppTenantId=your-tenant-id
 * ```
 *
 */
export const loadPrevAuthConfigFromEnv: () => AuthConfiguration = () => {
  const envConnections = loadConnectionsMapFromEnv()
  let authConfig: AuthConfiguration = {}

  if (envConnections.connectionsMap.length === 0) {
    // No connections provided, we need to populate the connection map with the old config settings
    if (process.env.MicrosoftAppId === undefined && process.env.NODE_ENV === 'production') {
      throw new Error('ClientId required in production')
    }
    const authority = process.env.authorityEndpoint ?? 'https://login.microsoftonline.com'
    authConfig = {
      tenantId: process.env.MicrosoftAppTenantId,
      clientId: process.env.MicrosoftAppId,
      clientSecret: process.env.MicrosoftAppPassword,
      certPemFile: process.env.certPemFile,
      certKeyFile: process.env.certKeyFile,
      connectionName: process.env.connectionName,
      FICClientId: process.env.MicrosoftAppClientId,
      authority,
      issuers: getDefaultIssuers(process.env.MicrosoftAppTenantId ?? '', authority),
      altBlueprintConnectionName: process.env.altBlueprintConnectionName,
    }
    envConnections.connections.set(DEFAULT_CONNECTION, authConfig)
    envConnections.connectionsMap.push({
      serviceUrl: '*',
      connection: DEFAULT_CONNECTION,
    })
  } else {
    // There are connections provided, use the default one.
    const defaultItem = envConnections.connectionsMap.find((item) => item.serviceUrl === '*')
    const defaultConn = defaultItem ? envConnections.connections.get(defaultItem.connection) : undefined
    if (!defaultConn) {
      throw new Error('No default connection found in environment connections.')
    }
    authConfig = defaultConn
  }

  authConfig.authority ??= 'https://login.microsoftonline.com'
  authConfig.issuers ??= getDefaultIssuers(authConfig.tenantId ?? '', authConfig.authority)

  return { ...authConfig, ...envConnections }
}

function loadConnectionsMapFromEnv () {
  const envVars = process.env
  const connections = new Map<string, AuthConfiguration>()
  const connectionsMap: ConnectionMapItem[] = []

  for (const [key, value] of Object.entries(envVars)) {
    if (key.startsWith('connections__')) {
      const parts = key.split('__')
      if (parts.length >= 4 && parts[2] === 'settings') {
        const connectionName = parts[1]
        const propertyPath = parts.slice(3).join('.') // e.g., 'issuers.0' or 'clientId'

        let config = connections.get(connectionName)
        if (!config) {
          config = {}
          connections.set(connectionName, config)
        }

        objectPath.set(config, propertyPath, value)
      }
    } else if (key.startsWith('connectionsMap__')) {
      const parts = key.split('__')
      if (parts.length === 3) {
        const index = parseInt(parts[1], 10)
        const property = parts[2]

        if (!connectionsMap[index]) {
          connectionsMap[index] = { serviceUrl: '', connection: '' }
        }

        (connectionsMap[index] as any)[property] = value
      }
    }
  }

  if (connections.size === 0) {
    logger.warn('No connections found in configuration.')
  }

  if (connectionsMap.length === 0) {
    logger.warn('No connections map found in configuration.')
    if (connections.size > 0) {
      const firstEntry = connections.entries().next().value

      if (firstEntry) {
        const [firstKey] = firstEntry
        // Provide a default connection map if none is specified
        connectionsMap.push({
          serviceUrl: '*',
          connection: firstKey,
        })
      }
    }
  }

  return {
    connections,
    connectionsMap,
  }
}

/**
 * Loads the authentication configuration from the provided config or from the environment variables
 * providing default values for authority and issuers.
 *
 * @returns The authentication configuration.
 * @throws Will throw an error if clientId is not provided in production.
 *
 * @example
 * ```
 * tenantId=your-tenant-id
 * clientId=your-client-id
 * clientSecret=your-client-secret
 *
 * certPemFile=your-cert-pem-file
 * certKeyFile=your-cert-key-file
 *
 * FICClientId=your-FIC-client-id
 *
 * connectionName=your-connection-name
 * authority=your-authority-endpoint
 * ```
 *
 */
export function getAuthConfigWithDefaults (config?: AuthConfiguration): AuthConfiguration {
  if (!config) return loadAuthConfigFromEnv()

  let envConfig: AuthConfiguration
  let providedConnections

  if (config.connections && config.connectionsMap) {
    providedConnections = { connections: config.connections, connectionsMap: config.connectionsMap }
  }
  const connections = providedConnections ?? loadConnectionsMapFromEnv()

  if (connections && connections.connectionsMap?.length === 0) {
    // No connections provided, we need to populate the connections map with the old config settings
    envConfig = buildLegacyAuthConfig()
    envConfig.clientId = config.clientId ?? envConfig.clientId
    envConfig.tenantId = config.tenantId ?? envConfig.tenantId
    envConfig.clientSecret = config.clientSecret ?? envConfig.clientSecret
    envConfig.certPemFile = config.certPemFile ?? envConfig.certPemFile
    envConfig.certKeyFile = config.certKeyFile ?? envConfig.certKeyFile
    envConfig.connectionName = config.connectionName ?? envConfig.connectionName
    envConfig.FICClientId = config.FICClientId ?? envConfig.FICClientId
    envConfig.authority = config.authority ?? envConfig.authority
    envConfig.issuers = config.issuers ?? envConfig.issuers
    envConfig.altBlueprintConnectionName = config.altBlueprintConnectionName ?? envConfig.altBlueprintConnectionName
    connections.connections?.set(DEFAULT_CONNECTION, envConfig)
    connections.connectionsMap.push({
      serviceUrl: '*',
      connection: DEFAULT_CONNECTION,
    })
  } else {
    // There are connections provided, use the default or specified connection
    const defaultItem = connections.connectionsMap?.find((item) => item.serviceUrl === '*')
    const defaultConn = defaultItem ? connections.connections?.get(defaultItem.connection) : undefined
    if (!defaultConn) {
      throw new Error('No default connection found in environment connections.')
    }
    envConfig = buildLegacyAuthConfig()
    envConfig.clientId = defaultConn.clientId ?? envConfig.clientId
    envConfig.tenantId = defaultConn.tenantId ?? envConfig.tenantId
    envConfig.clientSecret = defaultConn.clientSecret ?? envConfig.clientSecret
    envConfig.certPemFile = defaultConn.certPemFile ?? envConfig.certPemFile
    envConfig.certKeyFile = defaultConn.certKeyFile ?? envConfig.certKeyFile
    envConfig.connectionName = defaultConn.connectionName ?? envConfig.connectionName
    envConfig.FICClientId = defaultConn.FICClientId ?? envConfig.FICClientId
    envConfig.authority = defaultConn.authority ?? envConfig.authority
    envConfig.issuers = defaultConn.issuers ?? envConfig.issuers
    envConfig.altBlueprintConnectionName = defaultConn.altBlueprintConnectionName ?? envConfig.altBlueprintConnectionName
  }

  envConfig.authority ??= 'https://login.microsoftonline.com'
  envConfig.issuers ??= getDefaultIssuers(envConfig.tenantId ?? '', envConfig.authority)

  return {
    ...envConfig,
    ...connections,
  }
}

function buildLegacyAuthConfig (envPrefix: string = ''): AuthConfiguration {
  const prefix = envPrefix ? `${envPrefix}_` : ''
  const authority = process.env[`${prefix}authorityEndpoint`] ?? 'https://login.microsoftonline.com'
  const clientId = process.env[`${prefix}clientId`]

  if (!clientId && !envPrefix && process.env.NODE_ENV === 'production') {
    throw new Error('ClientId required in production')
  }
  if (!clientId && envPrefix) {
    throw new Error(`ClientId not found for connection: ${envPrefix}`)
  }

  return {
    tenantId: process.env[`${prefix}tenantId`],
    clientId: clientId!,
    clientSecret: process.env[`${prefix}clientSecret`],
    certPemFile: process.env[`${prefix}certPemFile`],
    certKeyFile: process.env[`${prefix}certKeyFile`],
    connectionName: process.env[`${prefix}connectionName`],
    FICClientId: process.env[`${prefix}FICClientId`],
    authority,
    issuers: getDefaultIssuers(process.env[`${prefix}tenantId`] ?? '', authority),
    altBlueprintConnectionName: process.env[`${prefix}altBlueprintConnectionName`],
  }
}

function getDefaultIssuers (tenantId: string, authority: string) : string[] {
  return [
    'https://api.botframework.com',
    `https://sts.windows.net/${tenantId}/`,
    `${authority}/${tenantId}/v2.0`
  ]
}
