/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ConfigurationLayer,
  createConfigurationLayer,
  freezeConfigurationLayer,
  isConfigurationInputError,
  setConfigurationValue,
  suggestConfigurationPath
} from './configuration'
import { debug } from '@microsoft/agents-telemetry'
import {
  envParser,
  envParserUtils,
  parseBooleanEnv,
  suggestClosest
} from '../utils/env'
import { ConnectionKeys, ConnectionMapKeys } from '../auth/settings'

const CONNECTIONS = 'CONNECTIONS'
const CONNECTIONS_MAP = 'CONNECTIONSMAP'
const CLOUD_ADAPTER_OPTIONS = 'CLOUDADAPTEROPTIONS'
const OUTBOUND_HOST_VALIDATOR = 'OUTBOUNDHOSTVALIDATOR'
const AGENT_APPLICATION = 'AGENTAPPLICATION'
const CLOUD_ADAPTER_OPTIONS_ENV_PREFIX = 'CloudAdapterOptions__'
const warnedCloudAdapterKeys = new Set<string>()
const cloudAdapterLogger = debug('agents:cloud-adapter')
const authLogger = debug('agents:authConfiguration')
const connectionMapParser = envParser<ConnectionMapKeys>({
  serviceUrl: envParserUtils.bypass,
  audience: envParserUtils.bypass,
  connection: envParserUtils.bypass
})
const cloudAdapterOptionsParser = envParser<'emitStackTrace' | 'validateServiceUrl'>({
  emitStackTrace: envParserUtils.bypass,
  validateServiceUrl: envParserUtils.bypass
})

interface ModernEnvironmentOptions {
  readonly reportCloudAdapterDiagnostics?: boolean
}

/**
 * Binds the supported schema-shaped `__` environment variables to the
 * canonical hierarchical configuration model.
 */
export function loadModernEnvironmentConfiguration (
  env: NodeJS.ProcessEnv = process.env,
  options: ModernEnvironmentOptions = {}
): ConfigurationLayer {
  const layer = createConfigurationLayer()
  const indexedHosts = new Map<number, string>()

  for (const [key, value] of Object.entries(env)) {
    if (!value?.trim()) {
      continue
    }

    const parts = key.split('__')
    const root = parts[0]?.toUpperCase()
    if (root === CONNECTIONS) {
      bindConnection(layer, parts, value, key, options.reportCloudAdapterDiagnostics === true)
    } else if (root === CONNECTIONS_MAP) {
      bindConnectionMap(layer, parts, value, key, options.reportCloudAdapterDiagnostics === true)
    } else if (root === CLOUD_ADAPTER_OPTIONS) {
      bindCloudAdapterOptions(layer, parts, value, key, options.reportCloudAdapterDiagnostics === true)
    } else if (root === OUTBOUND_HOST_VALIDATOR) {
      bindOutboundHostValidator(
        layer,
        parts,
        value,
        key,
        indexedHosts,
        options.reportCloudAdapterDiagnostics === true
      )
    } else if (root === AGENT_APPLICATION) {
      bindAuthorizationHandler(layer, parts, value, key, options.reportCloudAdapterDiagnostics === true)
    } else if (options.reportCloudAdapterDiagnostics === true) {
      const canonicalRoot = suggestConfigurationPath(parts[0] ?? '')
      const suggestedRoot = canonicalRoot
        ? canonicalRoot.charAt(0).toUpperCase() + canonicalRoot.slice(1)
        : undefined
      if (suggestedRoot) {
        emitHierarchySuggestion(key, [suggestedRoot, ...parts.slice(1)].join('__'), true)
      }
    }
  }

  if (indexedHosts.size > 0) {
    const configured = [...layer.outboundHostValidator.hosts ?? []]
    for (const [, host] of [...indexedHosts].sort(([left], [right]) => left - right)) {
      configured.push(host)
    }
    ;(layer.outboundHostValidator as { hosts?: readonly string[] }).hosts = configured
  }

  return freezeConfigurationLayer(layer)
}

function bindConnection (
  layer: ConfigurationLayer,
  parts: string[],
  value: string,
  sourceName: string,
  reportDiagnostics: boolean
): void {
  const format = 'Connections__<id>__Settings__<property>'
  if (parts[2]?.toUpperCase() !== 'SETTINGS') {
    if (reportDiagnostics && suggestClosest(parts[2] ?? '', ['Settings'], 4)) {
      emitHierarchySuggestion(sourceName, [parts[0], parts[1], 'Settings', ...parts.slice(3)].join('__'), true)
    }
    return
  }
  if (parts.length !== 4) {
    authLogger.warn(`Invalid connection environment variable: ${sourceName}. Expected format: ${format}.`)
    return
  }
  if (!parts[1]?.trim()) {
    authLogger.warn(`Invalid connection <id> in environment variable: ${sourceName}. Expected format: ${format}.`)
    return
  }
  if (!parts[3]?.trim()) {
    authLogger.warn(`Invalid connection <property> in environment variable: ${sourceName}. Expected format: ${format}.`)
    return
  }

  const property = parts[3] as ConnectionKeys
  const lookup = property.toLowerCase()
  if (lookup === 'ficclientid') {
    authLogger.warn('Connections__<id>__Settings__FICClientId is deprecated, please use Connections__<id>__Settings__FederatedClientId instead.')
  } else if (lookup === 'authority') {
    authLogger.warn('Connections__<id>__Settings__Authority is deprecated, please use Connections__<id>__Settings__AuthorityEndpoint instead.')
  } else if (lookup === 'scope') {
    authLogger.warn('Connections__<id>__Settings__Scope is deprecated, please use Connections__<id>__Settings__Scopes instead.')
  } else if (lookup !== 'alternateblueprintconnectionname' && reportDiagnostics) {
    const suggestedProperty = suggestedLeaf(
      `connections.${parts[1]}.settings.${property}`
    )
    if (suggestedProperty) {
      emitHierarchySuggestion(
        sourceName,
        [parts[0], parts[1], parts[2], suggestedProperty].join('__'),
        false
      )
    }
  }
  trySet(
    layer,
    `connections.${parts[1]}.settings.${property}`,
    normalizeConnectionEnvironmentValue(property, value),
    sourceName
  )
}

function bindConnectionMap (
  layer: ConfigurationLayer,
  parts: string[],
  value: string,
  sourceName: string,
  reportDiagnostics: boolean
): void {
  const format = 'ConnectionsMap__<index>__<property>'
  if (parts.length !== 3) {
    authLogger.warn(`Invalid connection map environment variable: ${sourceName}. Expected format: ${format}.`)
    return
  }
  if (!/^\d+$/.test(parts[1])) {
    authLogger.warn(`Invalid connection map <index> in environment variable: ${sourceName}. Expected format: ${format}, where <index> is a number.`)
    return
  }
  if (!parts[2]?.trim()) {
    authLogger.warn(`Invalid connection map <property> in environment variable: ${sourceName}. Expected format: ${format}.`)
    return
  }
  const parsed = connectionMapParser.parse(parts[2] as ConnectionMapKeys, value)
  if (parsed.key) {
    trySet(layer, `connectionsMap.${parts[1]}.${parsed.key}`, parsed.value, sourceName)
  } else if (reportDiagnostics) {
    const suggestedProperty = suggestedLeaf(`connectionsMap.${parts[1]}.${parts[2]}`)
    if (suggestedProperty) {
      emitHierarchySuggestion(
        sourceName,
        [parts[0], parts[1], suggestedProperty].join('__'),
        true
      )
    }
  }
}

function bindCloudAdapterOptions (
  layer: ConfigurationLayer,
  parts: string[],
  value: string,
  sourceName: string,
  reportDiagnostics: boolean
): void {
  if (parts.length !== 2 || !parts[1]?.trim()) {
    return
  }
  const property = parts[1]
  const parsed = cloudAdapterOptionsParser.parse(
    property as Parameters<typeof cloudAdapterOptionsParser.parse>[0],
    value
  )
  if (!parsed.key) {
    if (reportDiagnostics) {
      const suggestion = suggestClosest(property, cloudAdapterOptionsParser.keys, 4)
      const hint = suggestion ? ` Did you mean "${CLOUD_ADAPTER_OPTIONS_ENV_PREFIX}${suggestion}"?` : ''
      emitCloudAdapterWarning(sourceName, `Unknown CloudAdapterOptions env var: ${sourceName} (ignored).${hint}`)
    }
    return
  }
  if (parseBooleanEnv(parsed.value) === undefined) {
    if (reportDiagnostics) {
      emitCloudAdapterWarning(
        `${sourceName}=${value}`,
        `Ignored ${sourceName}=${value}; expected one of true/false/1/0.`
      )
    }
    return
  }
  trySet(layer, `cloudAdapterOptions.${parsed.key}`, parsed.value, sourceName)
}

function bindOutboundHostValidator (
  layer: ConfigurationLayer,
  parts: string[],
  value: string,
  sourceName: string,
  indexedHosts: Map<number, string>,
  reportDiagnostics: boolean
): void {
  if (parts.length === 3 && /^\d+$/.test(parts[2])) {
    if (parts[1]?.toUpperCase() === 'HOSTS') {
      indexedHosts.set(Number.parseInt(parts[2], 10), value.trim())
    } else if (reportDiagnostics && suggestClosest(parts[1] ?? '', ['Hosts'], 4)) {
      emitHierarchySuggestion(
        sourceName,
        [parts[0], 'Hosts', parts[2]].join('__'),
        true
      )
    }
    return
  }
  if (parts.length !== 2 || !parts[1]?.trim()) {
    return
  }
  if (reportDiagnostics) {
    const suggestedProperty = suggestedLeaf(`outboundHostValidator.${parts[1]}`)
    if (suggestedProperty) {
      emitHierarchySuggestion(sourceName, [parts[0], suggestedProperty].join('__'), true)
    }
  }
  trySet(layer, `outboundHostValidator.${parts[1]}`, value, sourceName)
}

function bindAuthorizationHandler (
  layer: ConfigurationLayer,
  parts: string[],
  value: string,
  sourceName: string,
  reportDiagnostics: boolean
): void {
  const userAuthorization = suggestClosest(parts[1] ?? '', ['UserAuthorization'], 4)
  const handlers = suggestClosest(parts[2] ?? '', ['Handlers'], 4)
  const settings = suggestClosest(parts[4] ?? '', ['Settings'], 4)
  if (parts.length !== 6 ||
    parts[1]?.toUpperCase() !== 'USERAUTHORIZATION' ||
    parts[2]?.toUpperCase() !== 'HANDLERS' ||
    parts[4]?.toUpperCase() !== 'SETTINGS' ||
    !parts[3]?.trim() ||
    !parts[5]?.trim()) {
    if (reportDiagnostics && parts.length === 6 && userAuthorization && handlers && settings) {
      emitHierarchySuggestion(
        sourceName,
        [parts[0], userAuthorization, handlers, parts[3], settings, parts[5]].join('__'),
        true
      )
    }
    return
  }

  const property = parts[5]
  if (reportDiagnostics && property.toLowerCase() !== 'alternateblueprintconnectionname') {
    const suggestedProperty = suggestedLeaf(
      `agentApplication.userAuthorization.handlers.${parts[3]}.settings.${property}`
    )
    if (suggestedProperty) {
      emitHierarchySuggestion(
        sourceName,
        [parts[0], parts[1], parts[2], parts[3], parts[4], suggestedProperty].join('__'),
        false
      )
    }
  }
  trySet(
    layer,
    `agentApplication.userAuthorization.handlers.${parts[3]}.settings.${property}`,
    normalizeAuthorizationEnvironmentValue(property, value),
    sourceName
  )
}

function normalizeConnectionEnvironmentValue (property: ConnectionKeys, value: string): string {
  const lookup = property.toLowerCase()
  if (lookup === 'sendx5c' || lookup === 'bypasslocalnetworkrestriction') {
    return String(value === 'true')
  }
  if (lookup === 'msalretrycount' || lookup === 'requesttimeout' || lookup === 'retrycount') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? String(parsed) : value
  }
  return value
}

function normalizeAuthorizationEnvironmentValue (property: string, value: string): string {
  const lookup = property.toLowerCase()
  if (lookup === 'enablesso') {
    return String(value !== 'false')
  }
  if (lookup === 'invalidsigninretrymax') {
    const parsed = Number.parseInt(value)
    return Number.isFinite(parsed) ? String(parsed) : value
  }
  return value
}

function trySet (
  layer: ConfigurationLayer,
  path: string,
  value: string,
  sourceName: string
): void {
  try {
    setConfigurationValue(layer, path, value, sourceName, 'environment')
  } catch (error) {
    if (!isConfigurationInputError(error)) {
      throw error
    }
    // Existing environment binders ignore unknown and invalid values.
  }
}

function emitCloudAdapterWarning (key: string, message: string): void {
  if (warnedCloudAdapterKeys.has(key)) {
    return
  }
  warnedCloudAdapterKeys.add(key)
  console.warn(`[agents:cloud-adapter] ${message}`)
  cloudAdapterLogger.warn(message)
}

function suggestedLeaf (canonicalPath: string): string | undefined {
  return suggestConfigurationPath(canonicalPath)?.split('.').at(-1)
}

function emitHierarchySuggestion (
  key: string,
  suggestion: string,
  ignored: boolean
): void {
  emitCloudAdapterWarning(
    key,
    `${ignored ? 'Ignored unknown' : 'Unrecognized'} configuration environment variable: ${key}. Did you mean "${suggestion}"?`
  )
}
