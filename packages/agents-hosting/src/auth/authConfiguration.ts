/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectionMapItem } from './msalConnectionManager'
import { debug, redactString, redactScopes, redactUrl } from '@microsoft/agents-telemetry'
import { loadEnvSettings, AuthConfiguration, envParser, envParserUtils, LoadEnv, applyDefaultSettings, DEFAULT_CONNECTION_MAP, ConnectionKeys, ConnectionMapKeys } from './settings'

export { type AuthConfiguration, AuthType, resolveAuthority } from './settings'
import { prune } from '../utils'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'

const logger = debug('agents:authConfiguration')

type NonOptional<T> = { [K in keyof Required<T>]: T[K] }

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
      federatedClientId: redactString(config.federatedClientId, true),
      certPemFile: redactString(config.certPemFile),
      certKeyFile: redactString(config.certKeyFile),
      WIDAssertionFile: redactString(config.WIDAssertionFile),
      federatedTokenFile: config.federatedTokenFile ? redactString(config.federatedTokenFile) : undefined,
      authType: config.authType ?? undefined,
      idpmResource: config.idpmResource ? redactUrl(config.idpmResource) : undefined,
      connectionName: config.connectionName,
      altBlueprintConnectionName: config.altBlueprintConnectionName,
      azureRegion: config.azureRegion,
      sendX5C: config.sendX5C,
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
  connections: new Map<string, AuthConfiguration>(),
  parser: envParser<ConnectionKeys>({
    authType: envParserUtils.bypass,
    tenantId: envParserUtils.bypass,
    clientId: envParserUtils.bypass,
    clientSecret: envParserUtils.bypass,
    certPemFile: envParserUtils.bypass,
    certKeyFile: envParserUtils.bypass,
    connectionName: envParserUtils.bypass,
    federatedClientId: envParserUtils.bypass,
    FICClientId (value) {
      logger.warn('Connections__<id>__Settings__FICClientId is deprecated, please use Connections__<id>__Settings__FederatedClientId instead.')
      return { key: 'federatedClientId', value } // redirect
    },
    authorityEndpoint: envParserUtils.bypass,
    authority (value) {
      logger.warn('Connections__<id>__Settings__Authority is deprecated, please use Connections__<id>__Settings__AuthorityEndpoint instead.')
      return { key: 'authorityEndpoint', value }  // redirect
    },
    scopes (value) {
      return this.issuers(value) // scopes can be comma or space separated list, same as issuers.
    },
    scope (value) {
      logger.warn('Connections__<id>__Settings__Scope is deprecated, please use Connections__<id>__Settings__Scopes instead.')
      return { key: 'scopes', value: this.scopes(value)?.value } // redirect with single scope
    },
    altBlueprintConnectionName: envParserUtils.bypass,
    WIDAssertionFile: envParserUtils.bypass,
    federatedTokenFile: envParserUtils.bypass,
    idpmResource: envParserUtils.bypass,
    azureRegion: envParserUtils.bypass,
    sendX5C: (value) => ({ value: value === 'true' }),
    issuers (value) {
      if (value.includes(',')) {
        return { value: value.split(',').map(s => s.trim()).filter(Boolean) }
      }
      return { value: value.split(/\s+/).filter(Boolean) }
    },
  }),
  default (connections?: AuthConfiguration['connections'], connectionsMap?: AuthConfiguration['connectionsMap']) {
    const conn = connections ?? this.connections
    const map = connectionsMap ?? connectionsMapEnv.connectionsMap
    const name = map?.find((item) => item.serviceUrl === '*')?.connection
    if (!name) {
      throw ExceptionHelper.generateException(Error, Errors.NoDefaultConnectionFound)
    }

    const connection = conn?.get(name ?? '')
    if (!connection) {
      throw ExceptionHelper.generateException(Error, Errors.ConnectionNotFoundInEnvironment, undefined, { connectionName: name })
    }

    return applyDefaultSettings({ ...connection, connections: conn, connectionsMap: map })
  },
  process (key:string, value: string) {
    const format = 'Connections__<id>__Settings__<property>'
    const parts = key.split('__')
    const [connections, id, settings, prop] = parts

    if (`${connections}/${settings}`.toUpperCase() !== 'CONNECTIONS/SETTINGS') {
      return false
    }

    if (parts.length !== 4) {
      logger.warn(`Invalid connection environment variable: ${key}. Expected format: ${format}.`)
      return false
    }

    if (!id?.trim()) {
      logger.warn(`Invalid connection <id> in environment variable: ${key}. Expected format: ${format}.`)
      return false
    }

    if (!prop?.trim()) {
      logger.warn(`Invalid connection <property> in environment variable: ${key}. Expected format: ${format}.`)
      return false
    }

    const result = this.parser.parse(prop as ConnectionKeys, value)
    if (!result.key) {
      return false
    }

    const config = this.connections.get(id) ?? {}
    config[result.key as keyof AuthConfiguration] = result.value
    this.connections.set(id, config)
    return true
  },
}

const connectionsMapEnv = {
  connectionsMap: [] as ConnectionMapItem[],
  parser: envParser<ConnectionMapKeys>({
    serviceUrl: envParserUtils.bypass,
    connection: envParserUtils.bypass,
    audience: envParserUtils.bypass,
  }),
  process (key: string, value: string) {
    const format = 'ConnectionsMap__<index>__<property>'
    const parts = key.split('__')
    const [connectionsMap, index, prop] = parts

    if (connectionsMap.toUpperCase() !== 'CONNECTIONSMAP') {
      return false
    }

    if (parts.length !== 3) {
      logger.warn(`Invalid connection map environment variable: ${key}. Expected format: ${format}.`)
      return false
    }

    const indexNumber = parseInt(index, 10)
    if (!index?.trim() || isNaN(indexNumber) || indexNumber < 0) {
      logger.warn(`Invalid connection map <index> in environment variable: ${key}. Expected format: ${format}, where <index> is a number.`)
      return false
    }

    if (!prop?.trim()) {
      logger.warn(`Invalid connection map <property> in environment variable: ${key}. Expected format: ${format}.`)
      return false
    }

    const result = this.parser.parse(prop as ConnectionMapKeys, value)
    if (!result.key) {
      return false
    }

    const mapItem = this.connectionsMap[indexNumber] ?? { ...DEFAULT_CONNECTION_MAP }
    mapItem[result.key as keyof ConnectionMapItem] = result.value
    this.connectionsMap[indexNumber] = mapItem
    return true
  },
}

/**
 * Legacy BotFramework style-like authentication configuration loaded from environment variables, with support for hot-reloading in test mode.
 * Environment variables should be named MicrosoftAppTenantId, MicrosoftAppId, MicrosoftAppPassword, etc.
 */
const legacyBotFrameworkEnv = {
  parser: envParser({
    MicrosoftAppTenantId: envParserUtils.redirect(connectionsEnv.parser, 'tenantId'),
    MicrosoftAppId: envParserUtils.redirect(connectionsEnv.parser, 'clientId'),
    MicrosoftAppPassword: envParserUtils.redirect(connectionsEnv.parser, 'clientSecret'),
    certPemFile: envParserUtils.redirect(connectionsEnv.parser, 'certPemFile'),
    certKeyFile: envParserUtils.redirect(connectionsEnv.parser, 'certKeyFile'),
    connectionName: envParserUtils.redirect(connectionsEnv.parser, 'connectionName'),
    MicrosoftAppClientId: envParserUtils.redirect(connectionsEnv.parser, 'federatedClientId'),
    authorityEndpoint: envParserUtils.redirect(connectionsEnv.parser, 'authorityEndpoint'),
    scope: envParserUtils.redirect(connectionsEnv.parser, 'scopes'),
    altBlueprintConnectionName: envParserUtils.redirect(connectionsEnv.parser, 'altBlueprintConnectionName'),
    WIDAssertionFile: envParserUtils.redirect(connectionsEnv.parser, 'WIDAssertionFile'),
    azureRegion: envParserUtils.redirect(connectionsEnv.parser, 'azureRegion'),
    sendX5C: envParserUtils.redirect(connectionsEnv.parser, 'sendX5C'),
    authType: envParserUtils.redirect(connectionsEnv.parser, 'authType'),
    federatedTokenFile: envParserUtils.redirect(connectionsEnv.parser, 'federatedTokenFile'),
    idpmResource: envParserUtils.redirect(connectionsEnv.parser, 'idpmResource'),
  }),
  process (env: LoadEnv) {
    return legacyPrefixEnv.process.call(this, env)
  },
}

/**
 * Legacy prefix-based authentication configuration loaded from environment variables, with support for hot-reloading in test mode.
 * Environment variables should be prefixed with the connection name, e.g. <CONNECTION_NAME>_ClientId, <CONNECTION_NAME>_TenantId, etc.
 */
const legacyPrefixEnv = {
  parser: envParser({
    tenantId: envParserUtils.redirect(connectionsEnv.parser, 'tenantId'),
    clientId: envParserUtils.redirect(connectionsEnv.parser, 'clientId'),
    clientSecret: envParserUtils.redirect(connectionsEnv.parser, 'clientSecret'),
    certPemFile: envParserUtils.redirect(connectionsEnv.parser, 'certPemFile'),
    certKeyFile: envParserUtils.redirect(connectionsEnv.parser, 'certKeyFile'),
    connectionName: envParserUtils.redirect(connectionsEnv.parser, 'connectionName'),
    FICClientId: envParserUtils.redirect(connectionsEnv.parser, 'federatedClientId'),
    authorityEndpoint: envParserUtils.redirect(connectionsEnv.parser, 'authorityEndpoint'),
    scope: envParserUtils.redirect(connectionsEnv.parser, 'scopes'),
    altBlueprintConnectionName: envParserUtils.redirect(connectionsEnv.parser, 'altBlueprintConnectionName'),
    WIDAssertionFile: envParserUtils.redirect(connectionsEnv.parser, 'WIDAssertionFile'),
    azureRegion: envParserUtils.redirect(connectionsEnv.parser, 'azureRegion'),
    sendX5C: envParserUtils.redirect(connectionsEnv.parser, 'sendX5C'),
    authType: envParserUtils.redirect(connectionsEnv.parser, 'authType'),
    federatedTokenFile: envParserUtils.redirect(connectionsEnv.parser, 'federatedTokenFile'),
    idpmResource: envParserUtils.redirect(connectionsEnv.parser, 'idpmResource'),
  }),
  process (env: LoadEnv, prefix?: string) {
    const settings: Partial<AuthConfiguration> = {}
    for (const key of this.parser.keys) {
      const k = prefix ? `${prefix}_${key}` : key
      const envValue = env[k.toUpperCase()]
      if (!envValue) {
        continue
      }
      const result = this.parser.parse(key, envValue.value)
      if (result.key) {
        settings[result.key as keyof AuthConfiguration] = result.value
      }
    }
    return settings
  },
}

const loadEnv = () => {
  connectionsEnv.connections = new Map<string, AuthConfiguration>()
  connectionsMapEnv.connectionsMap = []

  const env = loadEnvSettings((key, value) => {
    // Process the first parser that matches the environment variable key and value,
    // otherwise it continues to the next parser.
    return connectionsEnv.process(key, value) ||
           connectionsMapEnv.process(key, value)
  })

  if (connectionsEnv.connections.size === 0) {
    logger.warn('No connections found in configuration.')
  }

  if (connectionsMapEnv.connectionsMap.length === 0 && connectionsEnv.connections.size > 0) {
    logger.warn('No connections map found in configuration, assuming default connection map with serviceUrl "*" for the first connection.')
    const [key] = connectionsEnv.connections.keys()
    connectionsMapEnv.connectionsMap.push({ ...DEFAULT_CONNECTION_MAP, connection: key })
  }

  return {
    env,
    legacyBotFrameworkSettings: legacyBotFrameworkEnv.process(env),
    legacyPrefixSettings: legacyPrefixEnv.process(env)
  }
}

// Initial load of environment variables
let globalEnv = loadEnv()

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
export const loadAuthConfigFromEnv = (cnxName?: string): AuthConfiguration => {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  if (connectionsEnv.connections.size > 0) {
    return cnxName?.trim() ? connectionsEnv.default(undefined, [{ ...DEFAULT_CONNECTION_MAP, connection: cnxName }]) : connectionsEnv.default()
  }

  // No connections provided, we need to populate the connections map with the old config settings
  const result = applyDefaultSettings(cnxName?.trim() ? legacyPrefixEnv.process(globalEnv.env, cnxName) : globalEnv.legacyPrefixSettings)
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
export const loadPrevAuthConfigFromEnv: () => AuthConfiguration = () => {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  let result: AuthConfiguration
  if (connectionsEnv.connections.size > 0) {
    result = connectionsEnv.default()
  } else {
    // No connections provided, we need to populate the connection map with the old config settings
    result = applyDefaultSettings(globalEnv.legacyBotFrameworkSettings)
  }

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
export function getAuthConfigWithDefaults (config?: AuthConfiguration): AuthConfiguration {
  if (process.env.TEST_MODE === 'true') {
    globalEnv = loadEnv()
  }

  let result: AuthConfiguration
  if (!config) {
    result = loadAuthConfigFromEnv()
  } else {
    const { connections, connectionsMap } = config.connections?.size ? config : { connections: connectionsEnv.connections, connectionsMap: connectionsMapEnv.connectionsMap }
    if (connections?.size) {
      result = { ...globalEnv.legacyPrefixSettings, ...connectionsEnv.default(connections, connectionsMap) }
    } else {
      result = applyDefaultSettings({ ...globalEnv.legacyPrefixSettings, ...config })
    }
  }

  logger.info('Auth settings loaded from runtime configuration', summarizeAuthConfiguration(result), result.connectionsMap)
  return result
}
