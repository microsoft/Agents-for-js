/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug, redactString, redactScopes, redactUrl } from '@microsoft/agents-telemetry'
import { AuthConfiguration, applyDefaultSettings, DEFAULT_CONNECTION_MAP, ConnectionMapItem } from './settings'

export { type AuthConfiguration, type ConnectionSettings, type ConnectionSettingsBase, type MsalConnectionSettings, type SidecarConnectionSettings, AuthType, resolveAuthority, type ConnectionMapItem, resolveAuthType } from './settings'
import { prune } from '../utils'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import {
  ConfigurationContext,
  ConfigurationLayer,
  getConfigurationSnapshot
} from '../configuration/configuration'
import { loadModernEnvironmentConfiguration } from '../configuration/environmentConfiguration'
import {
  loadBotFrameworkEnvironmentConfiguration,
  loadBotFrameworkPrefixedEnvironmentConfiguration
} from '../configuration/botFrameworkEnvironmentCompatibility'

const logger = debug('agents:authConfiguration')

type NonOptional<T> = { [K in keyof Required<T>]: T[K] }
type ConnectionMapPatch = Partial<ConnectionMapItem>

/**
 * Summarizes the authentication configuration for logging by redacting sensitive information and pruning undefined values. This is used to log the loaded authentication settings without exposing secrets or personally identifiable information.
 * @remarks AuthConfiguration properties can change its shape, since this function is intended for logging, e.g. `scopes` will be a string instead of an array.
 */
function summarizeAuthConfiguration (authConfig: AuthConfiguration) {
  return [...authConfig.connections?.entries() ?? []].reduce((summary, [name, config]) => {
    summary[name] = prune({
      clientId: redactString(config.clientId, true),
      tenantId: redactString(config.tenantId, true),
      clientSecret: redactString(config.clientSecret),
      authorityEndpoint: config.authorityEndpoint ? redactUrl(config.authorityEndpoint) : undefined,
      scopes: (config.scopes ? redactScopes(config.scopes) : undefined) as any,
      issuers: config.issuers?.map(redactUrl).filter(e => e !== undefined),
      validateIssuer: config.validateIssuer,
      federatedClientId: redactString(config.federatedClientId, true),
      certPemFile: redactString(config.certPemFile),
      certKeyFile: redactString(config.certKeyFile),
      WIDAssertionFile: redactString(config.WIDAssertionFile),
      federatedTokenFile: config.federatedTokenFile ? redactString(config.federatedTokenFile) : undefined,
      authType: config.authType ?? undefined,
      idpmResource: config.idpmResource ? redactUrl(config.idpmResource) : undefined,
      connectionName: config.connectionName,
      altBlueprintConnectionName: config.altBlueprintConnectionName,
      alternateBlueprintConnectionName: undefined, // Alias of altBlueprintConnectionName, avoid logging duplicate info
      azureRegion: config.azureRegion,
      sendX5C: config.sendX5C,
      msalRetryCount: config.msalRetryCount,
      sidecarBaseUrl: config.sidecarBaseUrl ? redactUrl(config.sidecarBaseUrl) : undefined,
      serviceName: config.serviceName,
      blueprintServiceName: config.blueprintServiceName,
      bypassLocalNetworkRestriction: config.bypassLocalNetworkRestriction,
      requestTimeout: config.requestTimeout,
      retryCount: config.retryCount,
      // Don't log the following properties
      authority: undefined, // Deprecated, same as authorityEndpoint, avoid logging duplicate info
      FICClientId: undefined, // Deprecated, same as federatedClientId, avoid logging duplicate info
      scope: undefined, // Deprecated, same as scopes, avoid logging duplicate info
      connections: undefined, // Avoid logging nested connections
      connectionsMap: undefined, // Avoid logging nested connections map
    } satisfies NonOptional<AuthConfiguration>)
    return summary
  }, {} as Record<string, AuthConfiguration>)
}

/**
 * Latest authentication configuration loaded from environment variables, with support for hot-reloading in test mode.
 * Environment variables for connections should be in the format Connections__<id>__Settings__<property>, e.g. Connections__MyConnection__Settings__ClientId, Connections__MyConnection__Settings__TenantId, etc.
 * Environment variables for connections map should be in the format ConnectionsMap__<index>__<property>, e.g. ConnectionsMap__0__ServiceUrl, ConnectionsMap__0__Connection, etc.
 */
const connectionsEnv = {
  connections: new Map<string, AuthConfiguration>()
}

const connectionsMapEnv = {
  connectionsMap: new Map<number, ConnectionMapPatch>(),
  finalized: [] as ConnectionMapItem[]
}

const loadEnv = () => {
  const modern = loadModernEnvironmentConfiguration()
  connectionsEnv.connections.clear()
  for (const connection of modern.connections.values()) {
    connectionsEnv.connections.set(
      connection.id,
      { ...connection.settings } as AuthConfiguration
    )
  }
  connectionsMapEnv.connectionsMap.clear()
  for (const [index, item] of modern.connectionsMap) {
    connectionsMapEnv.connectionsMap.set(index, { ...item })
  }

  if (connectionsEnv.connections.size === 0) {
    logger.warn('No connections found in configuration.')
  }

  if (connectionsMapEnv.connectionsMap.size === 0 && connectionsEnv.connections.size > 0) {
    logger.warn('No connections map found in configuration, assuming default connection map with serviceUrl "*" for the first connection.')
    const [key] = connectionsEnv.connections.keys()
    connectionsMapEnv.connectionsMap.set(0, { ...DEFAULT_CONNECTION_MAP, connection: key })
  }
  return {
    legacyBotFrameworkSettings: configurationLayerSettings(
      loadBotFrameworkEnvironmentConfiguration()
    ),
    legacyPrefixSettings: configurationLayerSettings(
      loadBotFrameworkPrefixedEnvironmentConfiguration('')
    )
  }
}

interface AuthOperation {
  readonly connections?: ReadonlyMap<string, Readonly<AuthConfiguration>>
  readonly connectionsMap?: ReadonlyMap<number, Readonly<ConnectionMapPatch>>
  readonly flatSettings?: Readonly<AuthConfiguration>
  readonly replaceRegistry?: boolean
  readonly synthesizeFlatConnection?: boolean
}

function externalAuthOperation (layer: ConfigurationLayer): AuthOperation {
  return {
    connections: new Map(
      [...layer.connections.values()].map(connection => [connection.id, connection.settings])
    ),
    connectionsMap: layer.connectionsMap
  }
}

function configurationLayerSettings (
  layer: ConfigurationLayer,
  connectionName?: string
): AuthConfiguration {
  const connection = connectionName
    ? layer.connections.get(connectionName.toLowerCase())
    : layer.connections.values().next().value
  return connection ? { ...connection.settings } as AuthConfiguration : {}
}

function settingsOperation (
  settings: AuthConfiguration,
  synthesizeFlatConnection = false
): AuthOperation {
  const { connections, connectionsMap, ...flatSettings } = settings
  return {
    flatSettings,
    connections,
    connectionsMap: connectionsMap
      ? new Map(connectionsMap.map((item, index) => [index, item]))
      : undefined,
    synthesizeFlatConnection
  }
}

function registryOperation (settings: AuthConfiguration): AuthOperation {
  return {
    connections: settings.connections,
    connectionsMap: settings.connectionsMap
      ? new Map(settings.connectionsMap.map((item, index) => [index, item]))
      : undefined,
    replaceRegistry: true
  }
}

function environmentRegistryOperation (): AuthOperation {
  return {
    connections: connectionsEnv.connections,
    connectionsMap: connectionsMapEnv.connectionsMap
  }
}

function environmentRouteOperation (): AuthOperation {
  return {
    connectionsMap: connectionsMapEnv.connectionsMap
  }
}

function applyConnectionOperation (
  connections: Map<string, AuthConfiguration>,
  operation: AuthOperation
): void {
  if (operation.replaceRegistry) {
    const retained = new Set(
      [...operation.connections?.keys() ?? []].map(id => id.toLowerCase())
    )
    for (const id of connections.keys()) {
      if (!retained.has(id.toLowerCase())) {
        connections.delete(id)
      }
    }
  }

  for (const [id, settings] of operation.connections ?? []) {
    const existingId = findConnectionKey(connections, id)
    const targetId = existingId ?? id
    connections.set(targetId, { ...connections.get(targetId), ...settings })
  }
}

function findConnectionKey (
  connections: ReadonlyMap<string, AuthConfiguration> | undefined,
  requested: string | undefined
): string | undefined {
  if (!connections || !requested) {
    return undefined
  }
  const normalized = requested.toLowerCase()
  return [...connections.keys()].find(id => id.toLowerCase() === normalized)
}

function resolveConnectionsMap (operations: readonly AuthOperation[]): Map<number, ConnectionMapPatch> {
  const connectionsMap = new Map<number, ConnectionMapPatch>()
  for (const operation of operations) {
    for (const [index, item] of operation.connectionsMap ?? []) {
      connectionsMap.set(index, { ...connectionsMap.get(index), ...item })
    }
  }
  return connectionsMap
}

function finalizeConnectionsMap (
  patches: ReadonlyMap<number, Readonly<ConnectionMapPatch>>,
  connections: ReadonlyMap<string, AuthConfiguration>,
  synthesizeDefault = true
): ConnectionMapItem[] {
  if (synthesizeDefault && patches.size === 0 && connections.size > 0) {
    const [connection] = connections.keys()
    return [{ ...DEFAULT_CONNECTION_MAP, connection }]
  }

  return [...patches.entries()]
    .sort(([left], [right]) => left - right)
    .map(([index, item]) => {
      if (!item.serviceUrl || !item.connection) {
        throw ExceptionHelper.generateException(
          Error,
          Errors.InvalidConnectionMapEntry,
          undefined,
          { index: index.toString() }
        )
      }
      return {
        serviceUrl: item.serviceUrl,
        connection: item.connection,
        ...(item.audience === undefined ? {} : { audience: item.audience })
      }
    })
}

function resolveAuthOperations (
  operations: readonly AuthOperation[],
  connectionName?: string
): AuthConfiguration {
  const connections = new Map<string, AuthConfiguration>()
  for (const operation of operations) {
    applyConnectionOperation(connections, operation)
  }

  if (
    connections.size === 0 &&
    operations.some(operation => operation.synthesizeFlatConnection)
  ) {
    connections.set(DEFAULT_CONNECTION_MAP.connection, {})
  }

  const requiresDefaultRoute = operations.some(operation => operation.replaceRegistry)
  let connectionsMap = finalizeConnectionsMap(
    resolveConnectionsMap(operations),
    connections,
    !requiresDefaultRoute
  )
  if (connectionsMap.length === 0 && requiresDefaultRoute) {
    throw ExceptionHelper.generateException(Error, Errors.NoDefaultConnectionFound)
  }
  const requestedConnection = connections.size > 0 ? connectionName?.trim() : undefined
  const defaultConnection = connectionsMap.find(item => item.serviceUrl === '*')?.connection
  if (connectionsMap.length > 0 && !requestedConnection && !defaultConnection) {
    throw ExceptionHelper.generateException(Error, Errors.NoDefaultConnectionFound)
  }
  const selectedConnection = requestedConnection || defaultConnection || connections.keys().next().value

  if (connections.size > 0 && !selectedConnection) {
    throw ExceptionHelper.generateException(Error, Errors.NoDefaultConnectionFound)
  }
  const selectedConnectionKey = findConnectionKey(connections, selectedConnection)
  if (selectedConnection && !selectedConnectionKey) {
    throw ExceptionHelper.generateException(
      Error,
      Errors.ConnectionNotFoundInEnvironment,
      undefined,
      { connectionName: selectedConnection }
    )
  }
  if (requestedConnection) {
    connectionsMap = [{ ...DEFAULT_CONNECTION_MAP, connection: requestedConnection }]
  }

  if (selectedConnection) {
    const selectedSettings: AuthConfiguration = {}
    for (const operation of operations) {
      const operationConnectionKey = findConnectionKey(operation.connections, selectedConnection)
      const connectionSettings = operationConnectionKey
        ? operation.connections?.get(operationConnectionKey)
        : undefined
      if (connectionSettings) {
        Object.assign(selectedSettings, connectionSettings)
      }
      if (operation.flatSettings) {
        Object.assign(selectedSettings, operation.flatSettings)
      }
    }

    const resolved = applyDefaultSettings(selectedSettings)
    const providerSettings = { ...resolved }
    delete providerSettings.connections
    delete providerSettings.connectionsMap
    connections.set(selectedConnectionKey ?? selectedConnection, providerSettings)
    return { ...providerSettings, connections, connectionsMap }
  }

  const flatSettings: AuthConfiguration = {}
  for (const operation of operations) {
    Object.assign(flatSettings, operation.flatSettings)
  }
  return applyDefaultSettings(flatSettings)
}

function environmentOperation (
  legacySettings: AuthConfiguration
): AuthOperation {
  return connectionsEnv.connections.size > 0
    ? environmentRegistryOperation()
    : settingsOperation(legacySettings)
}

function externalOperations (context?: ConfigurationContext) {
  const snapshot = getConfigurationSnapshot(context)
  return {
    hasAuth: (['fallback', 'overrideEnvironment', 'enforce'] as const).some(mode =>
      snapshot[mode].connections.size > 0 ||
      snapshot[mode].connectionsMap.size > 0
    ),
    fallback: externalAuthOperation(snapshot.fallback),
    overrideEnvironment: externalAuthOperation(snapshot.overrideEnvironment),
    enforce: externalAuthOperation(snapshot.enforce)
  }
}

function preserveEnvironmentRegistryIdentity (
  result: AuthConfiguration,
  external: ReturnType<typeof externalOperations>,
  environmentRegistrySelected: boolean
): AuthConfiguration {
  if (external.hasAuth || !environmentRegistrySelected) {
    return result
  }

  for (const [id, settings] of result.connections ?? []) {
    const environmentId = findConnectionKey(connectionsEnv.connections, id)
    if (environmentId) {
      connectionsEnv.connections.set(environmentId, settings)
    }
  }
  connectionsMapEnv.finalized.splice(
    0,
    connectionsMapEnv.finalized.length,
    ...(result.connectionsMap ?? [])
  )
  result.connections = connectionsEnv.connections
  result.connectionsMap = connectionsMapEnv.finalized
  return result
}

// Initial load of environment variables
let globalEnv = loadEnv()

/**
 * Optional host-scoped inputs used while resolving authentication settings.
 */
export interface AuthConfigurationResolutionOptions {
  configurationContext?: ConfigurationContext
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
 * sendX5C=false
 *
 * FICClientId=your-FIC-client-id
 *
 * connectionName=your-connection-name
 * authority=your-authority-endpoint
 * ```
 *
 */
export const loadAuthConfigFromEnv = (
  cnxName?: string,
  options?: AuthConfigurationResolutionOptions
): AuthConfiguration => {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  const legacySettings = cnxName?.trim()
    ? configurationLayerSettings(
      loadBotFrameworkPrefixedEnvironmentConfiguration(cnxName),
      cnxName
    )
    : globalEnv.legacyPrefixSettings
  const external = externalOperations(options?.configurationContext)
  const result = preserveEnvironmentRegistryIdentity(resolveAuthOperations([
    external.fallback,
    environmentOperation(legacySettings),
    external.overrideEnvironment,
    external.enforce
  ], cnxName), external, connectionsEnv.connections.size > 0)
  if (cnxName && !result.clientId) {
    throw ExceptionHelper.generateException(Error, Errors.ClientIdNotFoundForConnection, undefined, { connectionName: cnxName })
  }

  logger.info('Auth settings loaded from environment', {
    connections: summarizeAuthConfiguration(result),
    connectionsMap: result.connectionsMap?.map(e => ({ ...e, serviceUrl: e.serviceUrl !== '*' ? redactUrl(e.serviceUrl) : e.serviceUrl })),
  })

  return result
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
export const loadPrevAuthConfigFromEnv = (
  options?: AuthConfigurationResolutionOptions
): AuthConfiguration => {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  const external = externalOperations(options?.configurationContext)
  const result = preserveEnvironmentRegistryIdentity(resolveAuthOperations([
    external.fallback,
    environmentOperation(globalEnv.legacyBotFrameworkSettings),
    external.overrideEnvironment,
    external.enforce
  ]), external, connectionsEnv.connections.size > 0)

  logger.info('Legacy auth settings loaded from environment', summarizeAuthConfiguration(result), result.connectionsMap)
  return result
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
 * sendX5C=false
 *
 * FICClientId=your-FIC-client-id
 *
 * connectionName=your-connection-name
 * authority=your-authority-endpoint
 * ```
 *
 */
export function getAuthConfigWithDefaults (
  config?: AuthConfiguration,
  options?: AuthConfigurationResolutionOptions
): AuthConfiguration {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  const external = externalOperations(options?.configurationContext)
  const operations: AuthOperation[] = [external.fallback]

  if (config?.connections?.size) {
    operations.push(settingsOperation(globalEnv.legacyPrefixSettings))
    if (!config.connectionsMap?.length) {
      operations.push(environmentRouteOperation())
    }
    operations.push(external.overrideEnvironment)
    operations.push(registryOperation(config))
  } else if (connectionsEnv.connections.size > 0) {
    if (config) {
      operations.push(settingsOperation(globalEnv.legacyPrefixSettings))
    }
    operations.push(environmentRegistryOperation())
    operations.push(external.overrideEnvironment)
  } else {
    operations.push(settingsOperation(globalEnv.legacyPrefixSettings))
    operations.push(external.overrideEnvironment)
    if (config) {
      operations.push(settingsOperation(config, true))
    }
  }
  operations.push(external.enforce)

  const result = preserveEnvironmentRegistryIdentity(
    resolveAuthOperations(operations),
    external,
    !config?.connections?.size && connectionsEnv.connections.size > 0
  )
  const directParticipates = Boolean(config?.connections?.size) ||
    connectionsEnv.connections.size === 0
  if (!external.hasAuth && config && directParticipates) {
    if (config.connections?.size) {
      result.connections = config.connections
    }
    if (config.connectionsMap?.length) {
      result.connectionsMap = config.connectionsMap
    }
  }
  logger.info('Auth settings loaded from runtime configuration', summarizeAuthConfiguration(result), result.connectionsMap)
  return result
}
