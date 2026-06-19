/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { debug } from '@microsoft/agents-telemetry'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'
import { AuthConfiguration } from '../authConfiguration'
import { AuthProvider } from '../authProvider'
import { SidecarHttpClient } from './sidecarHttpClient'
import { resolveTokenExpiry } from './sidecarTokenExpiry'
import {
  ResolvedSidecarConnectionSettings,
  SidecarRequestOptions,
  toSidecarConnectionSettings
} from './sidecarModels'

const logger = debug('agents:sidecar')

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Refresh slightly ahead of the real expiry so callers never receive a token that expires mid-flight.
const EXPIRY_BUFFER_MS = 30 * 1000

// Hard upper bound on cached entries; protects memory when many distinct identities are served.
const MAX_CACHE_ENTRIES = 500

interface CachedToken {
  token: string
  expiresOn: number
}

/**
 * Authentication provider that delegates token acquisition to the Microsoft Entra Agent ID
 * sidecar (agent container). This replaces MSAL at the connection layer, using the sidecar's
 * `/AuthorizationHeaderUnauthenticated/{serviceName}` endpoint for app-only and agentic identity
 * flows. The sidecar performs the full Blueprint→Instance→User chain internally; no MSAL exchange is
 * performed in-process.
 */
export class SidecarAuthProvider implements AuthProvider {
  public readonly connectionSettings?: AuthConfiguration
  private readonly _settings: ResolvedSidecarConnectionSettings
  private readonly _httpClient: SidecarHttpClient
  private readonly _tokenCache: Map<string, CachedToken> = new Map()

  /**
   * Creates a new {@link SidecarAuthProvider}.
   * @param connectionSettings The connection authentication configuration.
   */
  constructor (connectionSettings?: AuthConfiguration) {
    this.connectionSettings = connectionSettings
    this._settings = toSidecarConnectionSettings(connectionSettings)

    const resolvedUrl = SidecarHttpClient.resolveBaseUrl(this._settings.sidecarBaseUrl)
    SidecarHttpClient.validateBaseUrl(resolvedUrl, this._settings.bypassLocalNetworkRestriction)
    this._httpClient = new SidecarHttpClient(resolvedUrl, this._settings.requestTimeout, this._settings.retryCount)
    logger.debug('SidecarAuthProvider initialized serviceName=%s blueprintServiceName=%s', this._settings.serviceName, this._settings.blueprintServiceName)
  }

  /**
   * Acquires an app-only access token from the sidecar.
   * @param scope The scope for the token.
   */
  async getAccessToken (scope: string): Promise<string>
  /**
   * Acquires an app-only access token from the sidecar.
   * @param authConfig The authentication configuration. Ignored by the sidecar provider, which
   * owns the credential and derives the token from its configured service name; accepted only to
   * satisfy the {@link AuthProvider} overload.
   * @param scope The scope for the token.
   */
  async getAccessToken (authConfig: AuthConfiguration, scope: string): Promise<string>
  async getAccessToken (authConfigOrScope: AuthConfiguration | string, scope?: string): Promise<string> {
    const actualScope = typeof authConfigOrScope === 'string' ? authConfigOrScope : scope
    const options: SidecarRequestOptions = {
      scopes: actualScope ? [actualScope] : this._settings.scopes,
      requestAppToken: true
    }
    return this.getCachedToken(this._settings.serviceName, options)
  }

  /**
   * Acquires the Blueprint (agent application) token from the sidecar.
   * @param tenantId The tenant ID.
   * @param agentAppInstanceId The agent instance ID (from the inbound activity); maps to `AgentIdentity`.
   */
  async getAgenticApplicationToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    this.ensureConnectionSettings()
    const options: SidecarRequestOptions = {
      agentIdentity: agentAppInstanceId,
      tenant: tenantId
    }
    return this.getCachedToken(this._settings.blueprintServiceName, options)
  }

  /**
   * Acquires the autonomous agent (instance) token from the sidecar for the configured resource.
   * @param tenantId The tenant ID.
   * @param agentAppInstanceId The agent instance ID (from the inbound activity); maps to `AgentIdentity`.
   */
  async getAgenticInstanceToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    this.ensureConnectionSettings()
    const options: SidecarRequestOptions = {
      agentIdentity: agentAppInstanceId,
      requestAppToken: true,
      tenant: tenantId,
      scopes: this._settings.scopes
    }
    return this.getCachedToken(this._settings.serviceName, options)
  }

  /**
   * Acquires the agentic user token from the sidecar for the configured resource.
   * @param tenantId The tenant ID.
   * @param agentAppInstanceId The agent instance ID (from the inbound activity); maps to `AgentIdentity`.
   * @param upn The agentic user identifier. A GUID is sent as `AgentUserId`; otherwise as `AgentUsername`.
   * @param scopes The OAuth scopes to request.
   */
  async getAgenticUserToken (tenantId: string, agentAppInstanceId: string, upn: string, scopes: string[]): Promise<string> {
    this.ensureConnectionSettings()
    const isObjectId = GUID_REGEX.test(upn ?? '')
    const options: SidecarRequestOptions = {
      agentIdentity: agentAppInstanceId,
      agentUsername: isObjectId ? undefined : upn,
      agentUserId: isObjectId ? upn : undefined,
      tenant: tenantId,
      scopes: scopes ?? this._settings.scopes
    }
    return this.getCachedToken(this._settings.serviceName, options)
  }

  /**
   * On-behalf-of token exchange — not supported by the sidecar provider in Phase 1.
   */
  async acquireTokenOnBehalfOf (scopes: string[], oboAssertion: string): Promise<string>
  async acquireTokenOnBehalfOf (authConfig: AuthConfiguration, scopes: string[], oboAssertion: string): Promise<string>
  async acquireTokenOnBehalfOf (
    _authConfigOrScopes: AuthConfiguration | string[],
    _scopesOrOboAssertion?: string[] | string,
    _oboAssertion?: string
  ): Promise<string> {
    throw ExceptionHelper.generateException(Error, Errors.OnBehalfOfNotSupportedBySidecar)
  }

  /**
   * Checks sidecar availability via the `/healthz` endpoint.
   * @returns `true` when the sidecar is reachable and healthy.
   */
  async isHealthy (): Promise<boolean> {
    return this._httpClient.isHealthy()
  }

  private ensureConnectionSettings (): void {
    if (!this.connectionSettings) {
      throw ExceptionHelper.generateException(Error, Errors.SidecarConnectionSettingsRequired)
    }
  }

  private async getCachedToken (serviceName: string, options: SidecarRequestOptions): Promise<string> {
    const forceRefresh = options.forceRefresh === true
    const cacheKey = SidecarAuthProvider.buildCacheKey(serviceName, options)

    const cached = this.cacheGet(cacheKey, forceRefresh)
    if (cached) {
      return cached
    }

    const result = await this._httpClient.getAuthorizationHeaderUnauthenticated(serviceName, options)
    // The hosting stack always transmits the token as `Bearer {token}`. Reject any other scheme
    // (e.g. PoP) rather than silently emitting an invalid Authorization header.
    if (result.scheme && result.scheme.toLowerCase() !== 'bearer') {
      throw ExceptionHelper.generateException(Error, Errors.SidecarUnsupportedAuthScheme, undefined, { scheme: result.scheme })
    }
    this.cacheSet(cacheKey, { token: result.token, expiresOn: resolveTokenExpiry(result.token) })
    return result.token
  }

  private cacheGet (cacheKey: string, forceRefresh: boolean): string | undefined {
    const cached = this._tokenCache.get(cacheKey)
    if (cached) {
      if (!forceRefresh && cached.expiresOn >= Date.now() + EXPIRY_BUFFER_MS) {
        return cached.token
      }
      this._tokenCache.delete(cacheKey)
    }
    return undefined
  }

  private cacheSet (cacheKey: string, token: CachedToken): void {
    this._tokenCache.set(cacheKey, token)
    if (this._tokenCache.size > MAX_CACHE_ENTRIES) {
      this.pruneExpiredEntries()
      if (this._tokenCache.size > MAX_CACHE_ENTRIES) {
        this.evictNearestExpiry()
      }
    }
  }

  private pruneExpiredEntries (): void {
    const now = Date.now()
    for (const [key, value] of this._tokenCache) {
      if (value.expiresOn <= now) {
        this._tokenCache.delete(key)
      }
    }
  }

  private evictNearestExpiry (): void {
    const overflow = this._tokenCache.size - MAX_CACHE_ENTRIES
    if (overflow <= 0) {
      return
    }
    const sorted = [...this._tokenCache.entries()].sort((a, b) => a[1].expiresOn - b[1].expiresOn)
    for (let i = 0; i < overflow; i++) {
      this._tokenCache.delete(sorted[i][0])
    }
  }

  private static buildCacheKey (serviceName: string, options: SidecarRequestOptions): string {
    const scopes = options.scopes
      ? [...new Set(options.scopes.filter((s) => s && s.trim()))].sort().join(' ')
      : ''
    return [
      serviceName,
      options.agentIdentity ?? '',
      options.agentUsername ?? '',
      options.agentUserId ?? '',
      options.tenant ?? '',
      options.requestAppToken === true ? 'app' : 'user',
      scopes
    ].join('|')
  }
}
