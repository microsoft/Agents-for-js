/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import {
  ConfigurationLayer,
  createConfigurationLayer,
  freezeConfigurationLayer,
  isConfigurationInputError,
  setConfigurationValue
} from './configuration'
import { LoadEnv, loadEnvSettings } from '../utils/env'

const DEFAULT_CONNECTION_ID = 'serviceConnection'

const flatConnectionProperties = {
  MicrosoftAppTenantId: 'tenantId',
  MicrosoftAppId: 'clientId',
  MicrosoftAppPassword: 'clientSecret',
  certPemFile: 'certPemFile',
  certKeyFile: 'certKeyFile',
  connectionName: 'connectionName',
  MicrosoftAppClientId: 'federatedClientId',
  authorityEndpoint: 'authorityEndpoint',
  scope: 'scopes',
  altBlueprintConnectionName: 'altBlueprintConnectionName',
  alternateBlueprintConnectionName: 'altBlueprintConnectionName',
  WIDAssertionFile: 'WIDAssertionFile',
  azureRegion: 'azureRegion',
  sendX5C: 'sendX5C',
  msalRetryCount: 'msalRetryCount',
  authType: 'authType',
  federatedTokenFile: 'federatedTokenFile',
  idpmResource: 'idpmResource',
  sidecarBaseUrl: 'sidecarBaseUrl',
  serviceName: 'serviceName',
  blueprintServiceName: 'blueprintServiceName',
  bypassLocalNetworkRestriction: 'bypassLocalNetworkRestriction',
  requestTimeout: 'requestTimeout',
  retryCount: 'retryCount',
  validateIssuer: 'validateIssuer'
} as const

const prefixedConnectionProperties = {
  tenantId: 'tenantId',
  clientId: 'clientId',
  clientSecret: 'clientSecret',
  certPemFile: 'certPemFile',
  certKeyFile: 'certKeyFile',
  connectionName: 'connectionName',
  FICClientId: 'federatedClientId',
  authorityEndpoint: 'authorityEndpoint',
  scope: 'scopes',
  altBlueprintConnectionName: 'altBlueprintConnectionName',
  alternateBlueprintConnectionName: 'altBlueprintConnectionName',
  WIDAssertionFile: 'WIDAssertionFile',
  azureRegion: 'azureRegion',
  sendX5C: 'sendX5C',
  msalRetryCount: 'msalRetryCount',
  authType: 'authType',
  federatedTokenFile: 'federatedTokenFile',
  idpmResource: 'idpmResource',
  sidecarBaseUrl: 'sidecarBaseUrl',
  serviceName: 'serviceName',
  blueprintServiceName: 'blueprintServiceName',
  bypassLocalNetworkRestriction: 'bypassLocalNetworkRestriction',
  requestTimeout: 'requestTimeout',
  retryCount: 'retryCount',
  validateIssuer: 'validateIssuer'
} as const

const legacyAuthorizationProperties = {
  type: 'type',
  connectionName: 'azureBotOAuthConnectionName',
  connectionTitle: 'title',
  connectionText: 'text',
  maxAttempts: 'invalidSignInRetryMax',
  messages_invalidCode: 'invalidSignInRetryMessage',
  messages_invalidCodeFormat: 'invalidSignInRetryMessageFormat',
  messages_maxAttemptsExceeded: 'invalidSignInRetryMaxExceededMessage',
  obo_connection: 'oboConnectionName',
  obo_scopes: 'oboScopes',
  enableSso: 'enableSso',
  scopes: 'scopes',
  altBlueprintConnectionName: 'altBlueprintConnectionName'
} as const

interface BotFrameworkAuthorizationCompatibility {
  readonly layer: ConfigurationLayer
  readonly replacements: readonly Readonly<{
    legacyKey: string
    modernKey: string
  }>[]
}

/** Binds the flat Bot Framework single-connection environment variables. */
export function loadBotFrameworkEnvironmentConfiguration (
  env: NodeJS.ProcessEnv = process.env
): ConfigurationLayer {
  return bindConnectionCompatibility(env, undefined, flatConnectionProperties)
}

/** Binds the Bot Framework `<connectionName>_<property>` environment form. */
export function loadBotFrameworkPrefixedEnvironmentConfiguration (
  connectionName: string,
  env: NodeJS.ProcessEnv = process.env
): ConfigurationLayer {
  return bindConnectionCompatibility(env, connectionName, prefixedConnectionProperties)
}

/**
 * Binds Bot Framework-era `<handlerId>_<property>` authorization variables.
 * Only known runtime/external handler IDs participate, matching existing
 * compatibility behavior.
 */
export function loadBotFrameworkAuthorizationEnvironmentConfiguration (
  handlerIds: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): BotFrameworkAuthorizationCompatibility {
  const layer = createConfigurationLayer()
  const replacements: Array<{ legacyKey: string, modernKey: string }> = []

  for (const [legacyKey, rawValue] of Object.entries(env)) {
    if (!rawValue?.trim()) {
      continue
    }
    const id = handlerIds.find(candidate =>
      legacyKey.toLowerCase().startsWith(`${candidate.toLowerCase()}_`)
    )
    if (!id) {
      continue
    }

    const legacyProperty = legacyKey.substring(id.length + 1)
    const property = findProperty(legacyAuthorizationProperties, legacyProperty)
    if (!property) {
      continue
    }

    const value = normalizeAuthorizationValue(property, rawValue)
    if (!trySet(
      layer,
      `agentApplication.userAuthorization.handlers.${id}.settings.${property}`,
      value,
      legacyKey
    )) {
      continue
    }

    replacements.push({
      legacyKey,
      modernKey: `AgentApplication__UserAuthorization__Handlers__${id}__Settings__${property}`
    })
  }

  return {
    layer: freezeConfigurationLayer(layer),
    replacements: Object.freeze(replacements.map(replacement => Object.freeze(replacement)))
  }
}

function bindConnectionCompatibility (
  env: NodeJS.ProcessEnv,
  connectionName: string | undefined,
  properties: Readonly<Record<string, string>>
): ConfigurationLayer {
  const layer = createConfigurationLayer()
  const id = connectionName || DEFAULT_CONNECTION_ID
  const indexedEnvironment = loadEnvSettings(() => {}, env)

  for (const [legacyProperty, property] of Object.entries(properties)) {
    const key = connectionName ? `${connectionName}_${legacyProperty}` : legacyProperty
    const value = findEnvironmentValue(indexedEnvironment, key)
    if (!value?.trim()) {
      continue
    }
    trySet(
      layer,
      `connections.${id}.settings.${property}`,
      normalizeConnectionValue(property, value),
      key
    )
  }

  return freezeConfigurationLayer(layer)
}

function findEnvironmentValue (env: LoadEnv, key: string): string | undefined {
  return env[key.toUpperCase()]?.value
}

function findProperty (
  properties: Readonly<Record<string, string>>,
  input: string
): string | undefined {
  const key = Object.keys(properties).find(candidate => candidate.toLowerCase() === input.toLowerCase())
  return key ? properties[key] : undefined
}

function normalizeConnectionValue (property: string, value: string): string {
  if (property === 'sendX5C' || property === 'bypassLocalNetworkRestriction') {
    return String(value === 'true')
  }
  if (property === 'msalRetryCount' || property === 'requestTimeout' || property === 'retryCount') {
    const parsed = Number.parseInt(value, 10)
    return Number.isFinite(parsed) ? String(parsed) : value
  }
  return value
}

function normalizeAuthorizationValue (property: string, value: string): string {
  if (property === 'enableSso') {
    return String(value !== 'false')
  }
  if (property === 'invalidSignInRetryMax') {
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
): boolean {
  try {
    setConfigurationValue(layer, path, value, sourceName, 'environment')
    return true
  } catch (error) {
    if (!isConfigurationInputError(error)) {
      throw error
    }
    return false
  }
}
