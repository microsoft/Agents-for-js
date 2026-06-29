/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-telemetry'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'
import type { MsalConnectionSettings } from './msal/msalConnectionSettings'
import type { SidecarConnectionSettings } from './sidecar/sidecarConnectionSettings'

export type { MsalConnectionSettings } from './msal/msalConnectionSettings'
export type { SidecarConnectionSettings } from './sidecar/sidecarConnectionSettings'

const logger = debug('agents:authConfiguration')

const DEFAULT_CONNECTION = 'serviceConnection'
const AUTHORITY_DEFAULT = 'https://login.microsoftonline.com'

/**
 * A single entry in the connections map used to route an inbound activity
 * (matched by audience and/or serviceUrl) to a named connection.
 */
export interface ConnectionMapItem {
  serviceUrl: string
  audience?: string
  connection: string
}

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

  // .NET parity alias: keep altBlueprintConnectionName and alternateBlueprintConnectionName in sync.
  settings.altBlueprintConnectionName ??= settings.alternateBlueprintConnectionName
  if (settings.altBlueprintConnectionName) {
    settings.alternateBlueprintConnectionName = settings.altBlueprintConnectionName
  }

  if (!settings.clientId && process.env.NODE_ENV?.toLowerCase() === 'production') {
    throw ExceptionHelper.generateException(Error, Errors.ClientIdRequiredInProduction)
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
 * Connection-level settings common to every authentication provider.
 *
 * @remarks
 * Mirrors the .NET `Microsoft.Agents.Authentication.ConnectionSettingsBase` abstract class: these are
 * the credential-agnostic properties shared by all connection types. Provider-specific settings
 * extend this base (see {@link MsalConnectionSettings} for MSAL and {@link SidecarConnectionSettings}
 * for the Entra sidecar). The active provider for a connection is selected
 * by {@link ConnectionSettingsBase.authType | authType}; see `AuthProviderFactory`.
 */
export interface ConnectionSettingsBase {
  /**
   * The tenant ID for the authentication configuration.
   */
  tenantId?: string

  /**
   * The client ID for the authentication configuration. Required in production.
   */
  clientId?: string

  /**
   * The authentication type for the connection.
   */
  authType?: AuthType | string

  /**
   * A list of valid issuers for the authentication configuration.
   */
  issuers?: string[]

  /**
   * The connection name for the authentication configuration.
   */
  connectionName?: string

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
   * Entra Authentication Endpoint to use.
   *
   * @remarks
   * If not populated the Entra Public Cloud endpoint is assumed.
   * This example of Public Cloud Endpoint is https://login.microsoftonline.com
   * see also https://learn.microsoft.com/entra/identity-platform/authentication-national-cloud
   */
  authorityEndpoint?: string

  /**
   * @deprecated Use scopes instead.
   */
  scope?: string

  /**
   * The scopes for the authentication configuration.
   */
  scopes?: string[]

  /**
   * An optional alternative blueprint Connection name used when constructing a connector client.
   *
   * @remarks
   * Equivalent to the .NET `AlternateBlueprintConnectionName` connection setting. {@link alternateBlueprintConnectionName}
   * is an alias of this property that matches the .NET name exactly; when both are provided this property takes precedence.
   */
  altBlueprintConnectionName?: string

  /**
   * Alias of {@link altBlueprintConnectionName} named to match the .NET `AlternateBlueprintConnectionName`
   * connection setting exactly.
   *
   * @remarks
   * Provided for stricter .NET parity. The two properties are kept in sync during configuration normalization;
   * {@link altBlueprintConnectionName} takes precedence when both are set.
   */
  alternateBlueprintConnectionName?: string
}

/**
 * The complete settings for a single connection, across every provider.
 *
 * @remarks
 * This is the per-connection unit that an `AuthProvider` consumes: it combines the common base
 * ({@link ConnectionSettingsBase}) with the MSAL settings ({@link MsalConnectionSettings}) and the
 * Entra sidecar settings ({@link SidecarConnectionSettings}). The active provider for a connection is
 * selected by `authType`, so only the subset of these properties relevant to that provider is used.
 *
 * Conceptually this is the consumer-facing counterpart to the {@link AuthConfiguration} *container*:
 * each value in {@link AuthConfiguration.connections} is the settings for one connection. It parallels
 * the .NET `IConnectionSettings` (a single connection's settings) as distinct from the connection
 * registry. {@link AuthConfiguration} extends this type for backward compatibility (it doubles as the
 * settings for the legacy single connection).
 */
export interface ConnectionSettings extends MsalConnectionSettings, SidecarConnectionSettings {}

/**
 * Represents the authentication configuration.
 *
 * @remarks
 * The agent-level authentication container. It owns the connection registry
 * (`connections`/`connectionsMap`) and, for backward compatibility, also extends
 * {@link ConnectionSettings} so the legacy single-connection shape (a flat config with `clientId`,
 * `clientSecret`, etc.) keeps working — in that mode the top-level object *is* the one connection's
 * settings. The active provider for each connection is dispatched by `authType` via
 * `AuthProviderFactory`, so a single connection only uses the subset of these properties relevant to
 * its provider.
 */
export interface AuthConfiguration extends ConnectionSettings {
  /**
   * The connection registry: a map of connection name to that connection's settings.
   *
   * @remarks
   * Each value is the {@link ConnectionSettings} for one connection (typed as {@link AuthConfiguration}
   * for backward compatibility; only the connection-settings subset is consumed). An `AuthProvider` is
   * created per entry by `AuthProviderFactory`, dispatched by `authType`.
   */
  connections?: Map<string, AuthConfiguration>

  /**
   * A list of connection map items to map service URLs to connection names.
   */
  connectionsMap?: ConnectionMapItem[]
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
  IdentityProxyManager = 'IdentityProxyManager',
  EntraAuthSideCar = 'EntraAuthSideCar'
}
