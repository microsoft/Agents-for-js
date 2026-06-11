/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-telemetry'
import type { ConnectionMapItem } from './msalConnectionManager'

const logger = debug('agents:authConfiguration')

const DEFAULT_CONNECTION = 'serviceConnection'
const AUTHORITY_DEFAULT = 'https://login.microsoftonline.com'

export const DEFAULT_CONNECTION_MAP: ConnectionMapItem = { serviceUrl: '*', connection: DEFAULT_CONNECTION }

export type ConnectionKeys = keyof Omit<AuthConfiguration, 'connections' | 'connectionsMap'>
export type ConnectionMapKeys = keyof ConnectionMapItem

export interface LoadEnv {
  [upperKey: string]: { key: string, value: any }
}

export function loadEnvSettings (callback: (key: string, value: string) => void) {
  const env: LoadEnv = {}
  for (const [envKey, envValue] of Object.entries(process.env)) {
    if (!envValue?.trim()) {
      continue
    }

    env[envKey.toUpperCase()] = { key: envKey, value: envValue }

    callback(envKey, envValue)
  }

  return env
}

export function applyDefaultSettings (config: AuthConfiguration) {
  const settings = { ...config }
  settings.authorityEndpoint ??= settings.authority ?? AUTHORITY_DEFAULT
  settings.issuers ??= getDefaultIssuers(settings.tenantId ?? '', settings.authorityEndpoint)

  // For backward compatibility
  if (settings.federatedClientId) {
    settings.FICClientId = settings.federatedClientId
  }

  if (settings.scopes?.length) {
    settings.scope = settings.scopes?.[0]
  }

  if (settings.authorityEndpoint) {
    settings.authority = settings.authorityEndpoint
  }

  if (!settings.clientId && process.env.NODE_ENV?.toLowerCase() === 'production') {
    throw new Error('ClientId required in production')
  }

  const defaultConnections = settings.connections?.size
    ? settings.connections
    : new Map([[DEFAULT_CONNECTION, { ...settings }]])
  const defaultConnectionsMap = settings.connectionsMap?.length
    ? settings.connectionsMap
    : [DEFAULT_CONNECTION_MAP]

  settings.connections = defaultConnections
  settings.connectionsMap = defaultConnectionsMap
  return settings
}

/**
 * A type representing a parser settings object.
 */
type ParserSettings<K extends string> = {
  [key in K]: (value: string) => { key?: string, value?: any } | undefined
}

/**
 * Creates an environment variable parser that maps the variable keys to parsing functions.
 * @param settings An object where each key is an environment variable name and the value is a function
 * that takes the variable value as input and returns an object with optional `key` and `value` properties.
 * @remarks
 * The `key` property in the returned object can be used to rename the environment variable key,
 * while the `value` property contains the parsed value.
 * @returns An object with a `parse` method that takes an environment variable key and value,
 * and returns the parsed result.
 */
export function envParser<K extends string> (settings: ParserSettings<K> & ThisType<ParserSettings<K>>) {
  const keys = Object.keys(settings) as K[]
  const upperKeys = keys.reduce((acc, key) => {
    acc[key.toUpperCase()] = key
    return acc
  }, {} as Record<string, K>)
  return {
    keys,
    /**
     * Parses the given environment variable key and value using the provided settings.
     * @param key The environment variable key.
     * @param value The environment variable value.
     * @returns The parsed result with optional renamed key and parsed value.
     */
    parse (key: K, value: string) {
      const match = upperKeys[key.toUpperCase()]
      if (!match) {
        return {}
      }

      const result = settings[match](value)
      return { key: result?.key ?? match, value: result?.value }
    }
  }
}

/**
 * Utility functions for environment variable parsers.
 */
export const envParserUtils = {
  /**
   * Bypass parser that returns the value as is.
   * @param value The environment variable value.
   * @returns An object with the original value.
   */
  bypass: (value: string) => ({ value }),
  /**
   * Redirects the parsing to another parser for a specific key.
   * @param parser The target parser to redirect to.
   * @param key The key to use in the target parser.
   * @returns A function that takes the environment variable value and returns the parsed result from the target parser.
   */
  redirect: <Parser extends ReturnType<typeof envParser>>(parser: Parser, key: Parameters<Parser['parse']>[0]) => (value: string) => parser.parse(key, value)
}

/**
 * Resolves the full authority URL including the tenant ID.
 * Supports both patterns:
 *   - Tenant embedded in authority: https://login.microsoftonline.com/my-tenant
 *   - Authority + separate tenantId: https://login.microsoftonline.com + tenantId
 * Also handles trailing slashes on authority.
 */
export function resolveAuthority (authority?: string, tenantId?: string): string {
  const base = trimTrailingSlashes(authority ?? AUTHORITY_DEFAULT)
  const url = new URL(base)
  const hasPathSegment = url.pathname !== '/'
  if (hasPathSegment) {
    return base
  }
  return `${base}/${tenantId ?? 'botframework.com'}`
}

function trimTrailingSlashes (value: string): string {
  let end = value.length
  while (end > 0 && value.charCodeAt(end - 1) === 47) {
    end--
  }

  return end === value.length ? value : value.slice(0, end)
}

function getDefaultIssuers (tenantId: string, authority: string) : string[] {
  // Convert empty string to undefined so resolveAuthority applies its 'botframework.com' default
  const t = tenantId || undefined
  if (!t) {
    logger.warn('tenantId is not configured, defaulting to botframework.com')
  }
  return [
    'https://api.botframework.com',
    `${resolveAuthority('https://sts.windows.net', t)}/`,
    `${resolveAuthority(authority, t)}/v2.0`
  ]
}

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
   * Indicates whether to send the X5C param or not (for SNI authentication).
   */
  sendX5C?: boolean

  /**
   * A list of valid issuers for the authentication configuration.
   */
  issuers?: string[]

  /**
   * The connection name for the authentication configuration.
   */
  connectionName?: string

  /**
   * @deprecated Use federatedClientId instead.
   *
   * The FIC (First-Party Integration Channel) client ID.
   */
  FICClientId?: string,

  /**
   * @deprecated Use authorityEndpoint instead.
   *
   * Entra Authentication Endpoint to use.
   *
   * @remarks
   * If not populated the Entra Public Cloud endpoint is assumed.
   * This example of Public Cloud Endpoint is https://login.microsoftonline.com
   * see also https://learn.microsoft.com/entra/identity-platform/authentication-national-cloud
   */
  authority?: string

  /**
   * @deprecated Use scopes instead.
   */
  scope?: string

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

  /**
   * @deprecated Use `authType` set to `'WorkloadIdentity'` and `federatedTokenFile` instead.
   *
   * The path to K8s provided token.
   */
  WIDAssertionFile?: string

  /**
   * The Azure region for ESTS-R regional token acquisition (e.g. 'westus', 'eastus').
   * When set, MSAL routes token requests to the specified regional endpoint.
   * See https://learn.microsoft.com/en-us/entra/msal/javascript/node/regional-authorities for details.
   */
  azureRegion?: string

  /**
   * The authentication type for the connection.
   */
  authType?: AuthType | string

  /**
   * The path to the federated token file used for Workload Identity authentication.
   */
  federatedTokenFile?: string

  /**
   * Sets the resource URL for Identity Proxy Manager (IDPM).
   *
   * @remarks
   * Set this to the appropriate resource identifier when the application is running in an environment,
   * such as a Foundry container, that exposes Managed Identity through a container-specific IMDS endpoint.
   * This setting is only meaningful when using Identity Proxy Manager (AuthType.IdentityProxyManager) for authentication.
   */
  idpmResource?: string

  /**
   * Entra Authentication Endpoint to use.
   *
   * @remarks
   * If not populated the Entra Public Cloud endpoint is assumed.
   * This example of Public Cloud Endpoint is https://login.microsoftonline.com
   * see also https://learn.microsoft.com/entra/identity-platform/authentication-national-cloud
   */
  authorityEndpoint?: string

  /**
   * The federated client ID for the authentication configuration, used for workload identity federation scenarios.
   */
  federatedClientId?: string

  /**
   * The scopes for the authentication configuration.
   */
  scopes?: string[]
}

/**
 * Supported authentication types for agent connections.
 */
export enum AuthType {
  Certificate = 'Certificate',
  CertificateSubjectName = 'CertificateSubjectName',
  ClientSecret = 'ClientSecret',
  UserManagedIdentity = 'UserManagedIdentity',
  SystemManagedIdentity = 'SystemManagedIdentity',
  FederatedCredentials = 'FederatedCredentials',
  WorkloadIdentity = 'WorkloadIdentity',
  IdentityProxyManager = 'IdentityProxyManager'
}
