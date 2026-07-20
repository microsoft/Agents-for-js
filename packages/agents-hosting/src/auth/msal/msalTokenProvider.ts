/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthenticationResult, ConfidentialClientApplication, LogLevel, ManagedIdentityApplication, NodeSystemOptions } from '@azure/msal-node'
import { AuthConfiguration, AuthType, resolveAuthority, resolveAuthority as resolveAuthorityUtil, resolveAuthType } from '../authConfiguration'
import { AuthProvider } from '../authProvider'
import { debug, trace } from '@microsoft/agents-telemetry'
import { randomUUID } from 'crypto'
import { MemoryCache } from '../MemoryCache'
import jwt, { JwtPayload } from 'jsonwebtoken'
import fs from 'fs'
import crypto from 'crypto'
import { AuthenticationTraceDefinitions } from '../../observability'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../../errorHelper'

const audience = 'api://AzureADTokenExchange'
const logger = debug('agents:msal')
const agenticTokenRequestTimeoutMs = 30000

function isAbortError (error: unknown): error is Error {
  return error instanceof Error && error.name === 'AbortError'
}

function createTokenRequestTimeoutError (timeoutMs: number): Error {
  return ExceptionHelper.generateException(Error, Errors.TokenRequestTimeout, undefined, { timeoutMs: timeoutMs.toString() })
}

/**
 * Provides tokens using MSAL.
 */
export class MsalTokenProvider implements AuthProvider {
  private static readonly _accessTokenCache = new MemoryCache<string>()
  private static readonly _agenticTokenCache = new MemoryCache<string>()
  private static readonly _confidentialClients = new Map<string, ConfidentialClientApplication>()
  private static readonly _maxConfidentialClients = 100
  public readonly connectionSettings?: AuthConfiguration

  constructor (connectionSettings?: AuthConfiguration) {
    this.connectionSettings = connectionSettings
  }

  /**
   * Clears process-wide auth caches.
   */
  public static clearSharedCaches (): void {
    MsalTokenProvider._accessTokenCache.clear()
    MsalTokenProvider._agenticTokenCache.clear()
    MsalTokenProvider._confidentialClients.clear()
  }

  private static cacheKey (...parts: Array<string | number | boolean | undefined | null>): string {
    return JSON.stringify(parts.map(part => part ?? ''))
  }

  private static digest (value: string | Buffer | undefined): string {
    return value ? crypto.createHash('sha256').update(value).digest('base64url') : ''
  }

  private getOrCreateConfidentialClient (
    cacheKey: string,
    createClient: () => ConfidentialClientApplication
  ): ConfidentialClientApplication {
    const existing = MsalTokenProvider._confidentialClients.get(cacheKey)
    if (existing) {
      MsalTokenProvider._confidentialClients.delete(cacheKey)
      MsalTokenProvider._confidentialClients.set(cacheKey, existing)
      return existing
    }

    const created = createClient()
    MsalTokenProvider._confidentialClients.set(cacheKey, created)
    while (MsalTokenProvider._confidentialClients.size > MsalTokenProvider._maxConfidentialClients) {
      const oldestKey = MsalTokenProvider._confidentialClients.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      MsalTokenProvider._confidentialClients.delete(oldestKey)
    }
    return created
  }

  private getFileCacheIdentity (path?: string): string {
    if (!path) {
      return ''
    }

    try {
      const stat = fs.statSync(path)
      return `${path}:${stat.size}:${stat.mtimeMs}`
    } catch {
      return path
    }
  }

  private getAccessTokenCacheKey (authConfig: AuthConfiguration, scope: string): string {
    const authType = resolveAuthType(authConfig)
    let authority = resolveAuthorityUtil(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId)
    let credentialIdentity = ''

    switch (authType) {
      case AuthType.ClientSecret:
        credentialIdentity = MsalTokenProvider.digest(authConfig.clientSecret)
        break
      case AuthType.Certificate:
      case AuthType.CertificateSubjectName:
        credentialIdentity = MsalTokenProvider.cacheKey(
          this.getFileCacheIdentity(authConfig.certPemFile),
          this.getFileCacheIdentity(authConfig.certKeyFile),
          authConfig.sendX5C
        )
        break
      case AuthType.WorkloadIdentity:
        authority = `https://login.microsoftonline.com/${authConfig.tenantId}`
        credentialIdentity = this.getFileCacheIdentity(authConfig.federatedTokenFile ?? authConfig.WIDAssertionFile)
        break
      case AuthType.FederatedCredentials:
        credentialIdentity = authConfig.federatedClientId ?? authConfig.FICClientId ?? ''
        break
      case AuthType.UserManagedIdentity:
        authority = 'managed-identity'
        credentialIdentity = authConfig.clientId ?? ''
        break
      case AuthType.SystemManagedIdentity:
        authority = 'managed-identity'
        credentialIdentity = 'system'
        break
      default:
        credentialIdentity = 'unknown'
    }

    return MsalTokenProvider.cacheKey(
      'access-token',
      authType,
      authority,
      authConfig.clientId,
      scope,
      authConfig.azureRegion,
      credentialIdentity
    )
  }

  private cacheAccessToken (cacheKey: string, token: string, expiresOn?: Date | null): void {
    const ttlSeconds = this.getTokenCacheTtlSeconds(token, expiresOn)
    if (ttlSeconds > 0) {
      MsalTokenProvider._accessTokenCache.set(cacheKey, token, ttlSeconds)
    }
  }

  private cacheAgenticToken (cacheKey: string, token: string, ttlSeconds: number): void {
    const safeTtlSeconds = Math.floor(ttlSeconds) - 300
    if (safeTtlSeconds > 0) {
      MsalTokenProvider._agenticTokenCache.set(cacheKey, token, safeTtlSeconds)
    }
  }

  private cacheAgenticAuthenticationResult (cacheKey: string, token: AuthenticationResult): void {
    const ttlSeconds = this.getTokenCacheTtlSeconds(token.accessToken, token.expiresOn)
    if (ttlSeconds > 0) {
      MsalTokenProvider._agenticTokenCache.set(cacheKey, token.accessToken, ttlSeconds)
    }
  }

  private getAgenticTokenCacheKey (
    tenantId: string,
    clientId: string,
    scopes: string[],
    tokenBodyParameters: { [key: string]: any }
  ): string {
    const bodyKey = Object.keys(tokenBodyParameters)
      .sort()
      .filter(key => key !== 'user_federated_identity_credential')
      .map(key => `${key}=${MsalTokenProvider.digest(String(tokenBodyParameters[key]))}`)
      .join('&')

    return MsalTokenProvider.cacheKey(
      'agentic-token',
      this.resolveAuthority(tenantId),
      clientId,
      scopes.join(' '),
      bodyKey
    )
  }

  private getTokenCacheTtlSeconds (token: string, expiresOn?: Date | null): number {
    const expiresAtMs = expiresOn?.getTime() ?? this.getJwtExpiresAtMs(token)
    if (!expiresAtMs) {
      return 0
    }

    return Math.floor((expiresAtMs - Date.now()) / 1000) - 300
  }

  private getJwtExpiresAtMs (token: string): number | undefined {
    const payload = jwt.decode(token) as JwtPayload | string | null
    if (!payload || typeof payload === 'string' || typeof payload.exp !== 'number') {
      return undefined
    }

    return payload.exp * 1000
  }

  private getClientSecretClient (authConfig: AuthConfiguration): ConfidentialClientApplication {
    const cacheKey = MsalTokenProvider.cacheKey(
      'confidential-client',
      AuthType.ClientSecret,
      authConfig.clientId,
      resolveAuthorityUtil(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId),
      MsalTokenProvider.digest(authConfig.clientSecret)
    )

    return this.getOrCreateConfidentialClient(cacheKey, () => new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: resolveAuthorityUtil(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId),
        clientSecret: authConfig.clientSecret
      },
      system: this.sysOptions
    }))
  }

  private getCertificateClient (authConfig: AuthConfiguration): ConfidentialClientApplication {
    const cacheKey = MsalTokenProvider.cacheKey(
      'confidential-client',
      authConfig.authType ?? AuthType.Certificate,
      authConfig.clientId,
      resolveAuthorityUtil(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId),
      this.getFileCacheIdentity(authConfig.certPemFile),
      this.getFileCacheIdentity(authConfig.certKeyFile),
      authConfig.sendX5C
    )

    return this.getOrCreateConfidentialClient(cacheKey, () => {
      const privateKeySource = fs.readFileSync(authConfig.certKeyFile as string)

      const privateKeyObject = crypto.createPrivateKey({
        key: privateKeySource,
        format: 'pem'
      })

      const privateKey = privateKeyObject.export({
        format: 'pem',
        type: 'pkcs8'
      })

      const pemFile = fs.readFileSync(authConfig.certPemFile as string)
      const pubKeyObject = new crypto.X509Certificate(pemFile)

      return new ConfidentialClientApplication({
        auth: {
          clientId: authConfig.clientId || '',
          authority: resolveAuthority(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId),
          clientCertificate: {
            privateKey: privateKey as string,
            thumbprint: pubKeyObject.fingerprint.replaceAll(':', ''),
            x5c: pemFile.toString()
          }
        },
        system: this.sysOptions
      })
    })
  }

  /**
   * Gets an access token using the auth configuration from the MsalTokenProvider instance and the provided scope.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  public async getAccessToken (scope: string): Promise<string>
  /**
   * Gets an access token.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  public async getAccessToken (authConfig: AuthConfiguration, scope: string): Promise<string>
  public async getAccessToken (authConfigOrScope: AuthConfiguration | string, scope?: string): Promise<string> {
    return trace(AuthenticationTraceDefinitions.getAccessToken, async ({ record }) => {
      let authConfig: AuthConfiguration
      let actualScope: string

      if (typeof authConfigOrScope === 'string') {
      // Called as getAccessToken(scope)
        if (!this.connectionSettings) {
          throw new Error('Connection settings must be provided to constructor when calling getAccessToken(scope)')
        }
        authConfig = this.connectionSettings
        actualScope = authConfigOrScope
      } else {
      // Called as getAccessToken(authConfig, scope)
        authConfig = authConfigOrScope
        actualScope = scope as string
      }

      record({ scope: actualScope })

      if (!authConfig.clientId && process.env.NODE_ENV !== 'production') {
        record({ method: 'unknown' })
        return ''
      }

      const accessTokenCacheKey = this.getAccessTokenCacheKey(authConfig, actualScope)
      const cachedAccessToken = MsalTokenProvider._accessTokenCache.get(accessTokenCacheKey)
      if (cachedAccessToken) {
        logger.debug('getAccessToken cache hit clientId=%s scope=%s', authConfig.clientId, actualScope)
        return cachedAccessToken
      }

      let token
      const authType = resolveAuthType(authConfig)
      record({ method: authType })
      logger.debug('getAccessToken via method=%s clientId=%s scope=%s', authType, authConfig.clientId, actualScope)

      switch (authType) {
        case AuthType.WorkloadIdentity: {
          const tokenFilePath = authConfig.federatedTokenFile ?? authConfig.WIDAssertionFile
          if (!tokenFilePath) {
            throw ExceptionHelper.generateException(Error, Errors.WorkloadIdentityTokenFileRequired)
          }
          token = await this.acquireAccessTokenViaWID(authConfig, actualScope)
          break
        }
        case AuthType.FederatedCredentials:
          if (!authConfig.federatedClientId && !authConfig.FICClientId) {
            throw ExceptionHelper.generateException(Error, Errors.FICClientIdRequired)
          }
          token = await this.acquireAccessTokenViaFIC(authConfig, actualScope)
          break
        case AuthType.ClientSecret:
          if (!authConfig.clientSecret) {
            throw ExceptionHelper.generateException(Error, Errors.ClientSecretRequired)
          }
          token = await this.acquireAccessTokenViaSecret(authConfig, actualScope)
          break
        case AuthType.Certificate:
        case AuthType.CertificateSubjectName:
          if (!authConfig.certPemFile || !authConfig.certKeyFile) {
            throw ExceptionHelper.generateException(Error, Errors.CertificateFilesRequired)
          }
          token = await this.acquireTokenWithCertificate(authConfig, actualScope)
          break
        case AuthType.UserManagedIdentity:
          if (!authConfig.clientId) {
            throw ExceptionHelper.generateException(Error, Errors.ClientIdRequiredForUserManagedIdentity)
          }
          token = await this.acquireTokenWithUserAssignedIdentity(authConfig, actualScope)
          break
        case AuthType.SystemManagedIdentity:
          token = await this.acquireTokenWithSystemAssignedIdentity(authConfig, actualScope)
          break
        default:
          throw ExceptionHelper.generateException(Error, Errors.UnsupportedAuthType, undefined, { authType })
      }

      if (token === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireToken)
      }

      this.cacheAccessToken(accessTokenCacheKey, token)
      return token
    })
  }

  public async acquireTokenOnBehalfOf (scopes: string[], oboAssertion: string): Promise<string>
  public async acquireTokenOnBehalfOf (authConfig: AuthConfiguration, scopes: string[], oboAssertion: string): Promise<string>
  public async acquireTokenOnBehalfOf (
    authConfigOrScopes: AuthConfiguration | string[],
    scopesOrOboAssertion?: string[] | string,
    oboAssertion?: string
  ): Promise<string> {
    return trace(AuthenticationTraceDefinitions.acquireTokenOnBehalfOf, async ({ record }) => {
      let authConfig: AuthConfiguration
      let actualScopes: string[]
      let actualOboAssertion: string

      if (Array.isArray(authConfigOrScopes)) {
      // Called as acquireTokenOnBehalfOf(scopes, oboAssertion)
        if (!this.connectionSettings) {
          throw new Error('Connection settings must be provided to constructor when calling acquireTokenOnBehalfOf(scopes, oboAssertion)')
        }
        authConfig = this.connectionSettings
        actualScopes = authConfigOrScopes
        actualOboAssertion = scopesOrOboAssertion as string
      } else {
      // Called as acquireTokenOnBehalfOf(authConfig, scopes, oboAssertion)
        authConfig = authConfigOrScopes
        actualScopes = scopesOrOboAssertion as string[]
        actualOboAssertion = oboAssertion!
      }

      record({ scopes: actualScopes })
      logger.debug('acquireTokenOnBehalfOf clientId=%s scopes=%o', authConfig.clientId, actualScopes)

      const cca = this.getClientSecretClient(authConfig)
      const token = await cca.acquireTokenOnBehalfOf({
        oboAssertion: actualOboAssertion,
        scopes: actualScopes
      })
      if (!token?.accessToken) {
        throw new Error('Failed to acquire token on behalf of user')
      }

      return token.accessToken
    })
  }

  public async getAgenticInstanceToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    return trace(AuthenticationTraceDefinitions.getAgenticInstanceToken, async ({ record }) => {
      logger.debug('getAgenticInstanceToken tenantId=%s agentAppInstanceId=%s', tenantId, agentAppInstanceId)
      record({ agenticInstanceId: agentAppInstanceId })

      if (!this.connectionSettings) {
        throw new Error('Connection settings must be provided when calling getAgenticInstanceToken')
      }

      const instanceTokenCacheKey = MsalTokenProvider.cacheKey(
        'agentic-instance-token',
        this.resolveAuthority(tenantId),
        agentAppInstanceId,
        this.connectionSettings.clientId,
        this.connectionSettings.azureRegion
      )
      const cachedInstanceToken = MsalTokenProvider._agenticTokenCache.get(instanceTokenCacheKey)
      if (cachedInstanceToken) {
        return cachedInstanceToken
      }

      const appToken = await this.getAgenticApplicationToken(tenantId, agentAppInstanceId)
      const cca = new ConfidentialClientApplication({
        auth: {
          clientId: agentAppInstanceId,
          clientAssertion: appToken,
          authority: this.resolveAuthority(tenantId),
        },
        system: this.sysOptions
      })

      const token = await cca.acquireTokenByClientCredential({
        scopes: ['api://AzureAdTokenExchange/.default'],
        correlationId: randomUUID(),
        azureRegion: this.connectionSettings?.azureRegion
      })

      if (!token?.accessToken) {
        throw new Error(`Failed to acquire instance token for agent instance: ${agentAppInstanceId}`)
      }

      this.cacheAgenticAuthenticationResult(instanceTokenCacheKey, token)
      return token.accessToken
    })
  }

  /**
   * This method can optionally accept a tenant ID that overrides the tenant ID in the connection settings.
   * The passed tenantId is always preferred over the configured tenantId when present.
   * @param tenantId
   * @returns
   */
  private resolveAuthority (tenantId?: string) : string {
    const { authorityEndpoint: configuredAuth, authority, tenantId: configuredTenantId } = this.connectionSettings ?? {}

    if (!tenantId) {
      // No agentic tenant override — delegate to shared utility
      return resolveAuthorityUtil(configuredAuth ?? authority, configuredTenantId)
    }

    // Agentic override: build a clean base using the override tenant, then replace any
    // /common or GUID placeholder left in the authority (e.g. from a multi-tenant config)
    const base = resolveAuthorityUtil(configuredAuth ?? authority, tenantId)
    const guidPattern = /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

    if (base.endsWith('/common') || guidPattern.test(base)) {
      return base.replace(
        /\/(?:common|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?=\/|$)/,
        `/${tenantId}`
      )
    }

    return base
  }

  /**
   * Does a direct HTTP call to acquire a token for agentic scenarios - do not use this directly!
   * This method will be removed once MSAL is updated with the necessary features.
   * (This is required in order to pass additional parameters into the auth call)
   * @param tenantId
   * @param clientId
   * @param clientAssertion
   * @param scopes
   * @param tokenBodyParameters
   * @returns
   */
  private async acquireTokenForAgenticScenarios (tenantId: string, clientId: string, clientAssertion: string | undefined, scopes: string[], tokenBodyParameters: { [key: string]: any }): Promise<string | null> {
    if (!this.connectionSettings) {
      throw new Error('Connection settings must be provided when calling getAgenticInstanceToken')
    }

    logger.debug('acquireTokenForAgenticScenarios clientId=%s tenantId=%s scopes=%o grant_type=%s', clientId, tenantId, scopes, tokenBodyParameters.grant_type)
    // Check cache first
    const cacheKey = this.getAgenticTokenCacheKey(tenantId, clientId, scopes, tokenBodyParameters)
    if (MsalTokenProvider._agenticTokenCache.get(cacheKey)) {
      return MsalTokenProvider._agenticTokenCache.get(cacheKey) as string
    }

    const url = `${this.resolveAuthority(tenantId)}/oauth2/v2.0/token`

    const data: { [key: string]: any } = {
      client_id: clientId,
      scope: scopes.join(' '),
      ...tokenBodyParameters
    }

    if (clientAssertion) {
      data.client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'
      data.client_assertion = clientAssertion
    } else {
      data.client_secret = this.connectionSettings.clientSecret
    }

    if (data.grant_type !== 'user_fic') {
      data.client_info = '2'
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort(createTokenRequestTimeoutError(agenticTokenRequestTimeoutMs))
    }, agenticTokenRequestTimeoutMs)

    const token = await fetch(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
        },
        body: new URLSearchParams(data as Record<string, string>).toString(),
        signal: controller.signal
      }
    ).then(async (response) => {
      if (!response.ok) {
        const errorBody = await response.text()
        const error = new Error(`Token request failed with status ${response.status}: ${errorBody}`)
        ;(error as any).toJSON = () => ({ status: response.status, body: errorBody })
        throw error
      }
      return response.json() as Promise<{ access_token: string, expires_in: number }>
    }).catch((error) => {
      const resolvedError = isAbortError(error)
        ? (controller.signal.reason instanceof Error ? controller.signal.reason : createTokenRequestTimeoutError(agenticTokenRequestTimeoutMs))
        : error
      logger.error('Error acquiring token: ', resolvedError.toJSON ? resolvedError.toJSON() : resolvedError)
      throw resolvedError
    }).finally(() => {
      clearTimeout(timeoutId)
    })

    // capture token, expire local cache 5 minutes early
    this.cacheAgenticToken(cacheKey, token.access_token, token.expires_in)
    return token.access_token
  }

  public async getAgenticUserToken (tenantId: string, agentAppInstanceId: string, agenticUserId: string, scopes: string[]): Promise<string> {
    return trace(AuthenticationTraceDefinitions.getAgenticUserToken, async ({ record }) => {
      logger.debug('getAgenticUserToken tenantId=%s agentAppInstanceId=%s scopes=%o', tenantId, agentAppInstanceId, scopes)
      record({ agenticInstanceId: agentAppInstanceId, agenticUserId, scopes })

      const userTokenParameters = {
        user_id: agenticUserId,
        grant_type: 'user_fic',
      }
      const userTokenCacheKey = this.getAgenticTokenCacheKey(tenantId, agentAppInstanceId, scopes, userTokenParameters)
      const cachedUserToken = MsalTokenProvider._agenticTokenCache.get(userTokenCacheKey)
      if (cachedUserToken) {
        return cachedUserToken
      }

      const agentToken = await this.getAgenticApplicationToken(tenantId, agentAppInstanceId)
      const instanceToken = await this.getAgenticInstanceToken(tenantId, agentAppInstanceId)

      const token = await this.acquireTokenForAgenticScenarios(tenantId, agentAppInstanceId, agentToken, scopes, {
        ...userTokenParameters,
        user_federated_identity_credential: instanceToken,
      })

      if (!token) {
        throw new Error(`Failed to acquire instance token for user token: ${agentAppInstanceId}`)
      }

      return token
    })
  }

  public async getAgenticApplicationToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    if (!this.connectionSettings?.clientId) {
      throw new Error('Connection settings must be provided when calling getAgenticApplicationToken')
    }
    logger.debug('getAgenticApplicationToken clientId=%s tenantId=%s agentAppInstanceId=%s', this.connectionSettings.clientId, tenantId, agentAppInstanceId)

    const authType = resolveAuthType(this.connectionSettings)

    if (authType === AuthType.IdentityProxyManager) {
      let resource: string
      if (!this.connectionSettings.idpmResource) {
        resource = 'api://AzureAdTokenExchange/.default'
      } else if (!URL.canParse(this.connectionSettings.idpmResource)) {
        throw new Error('idpmResource must be a valid absolute URI')
      } else {
        resource = this.connectionSettings.idpmResource
      }
      const msiApp = new ManagedIdentityApplication({
        managedIdentityIdParams: {
          userAssignedClientId: this.connectionSettings.clientId
        },
        system: this.sysOptions
      })
      const tokenResult = await msiApp.acquireToken({ resource })
      if (!tokenResult?.accessToken) {
        throw new Error(`Failed to acquire token via IdentityProxyManager for agent instance: ${agentAppInstanceId}`)
      }
      logger.debug('getAgenticApplicationToken via IdentityProxyManager clientId=%s resource=%s', this.connectionSettings.clientId, resource)
      return tokenResult.accessToken
    }

    let clientAssertion

    switch (authType) {
      case AuthType.WorkloadIdentity: {
        const tokenFilePath = this.connectionSettings.federatedTokenFile ?? this.connectionSettings.WIDAssertionFile
        if (tokenFilePath === undefined) {
          throw ExceptionHelper.generateException(Error, Errors.WorkloadIdentityTokenFileRequired)
        }
        clientAssertion = fs.readFileSync(tokenFilePath as string, 'utf8')
        break
      }
      case AuthType.FederatedCredentials:
        if (!this.connectionSettings.federatedClientId && !this.connectionSettings.FICClientId) {
          throw ExceptionHelper.generateException(Error, Errors.FICClientIdRequired)
        }
        clientAssertion = await this.fetchExternalToken(this.connectionSettings.federatedClientId as string || this.connectionSettings.FICClientId as string)
        break
      case AuthType.Certificate:
      case AuthType.CertificateSubjectName:
        if (!this.connectionSettings.certPemFile || !this.connectionSettings.certKeyFile) {
          throw ExceptionHelper.generateException(Error, Errors.CertificateFilesRequired)
        }
        clientAssertion = this.getAssertionFromCert(this.connectionSettings)
        break
    }

    const token = await this.acquireTokenForAgenticScenarios(tenantId, this.connectionSettings.clientId, clientAssertion, ['api://AzureAdTokenExchange/.default'], {
      grant_type: 'client_credentials',
      fmi_path: agentAppInstanceId,
    })

    if (!token) {
      throw new Error(`Failed to acquire token for agent instance: ${agentAppInstanceId}`)
    }

    return token
  }

  private readonly sysOptions: NodeSystemOptions = {
    loggerOptions: {
      logLevel: LogLevel.Trace,
      loggerCallback: (level, message, containsPii) => {
        if (containsPii) {
          return
        }
        switch (level) {
          case LogLevel.Error:
            logger.error(message)
            return
          case LogLevel.Info:
            logger.debug(message)
            return
          case LogLevel.Warning:
            if (!message.includes('Warning - No client info in response')) {
              logger.warn(message)
            }
            return
          case LogLevel.Verbose:
            logger.debug(message)
        }
      },
      piiLoggingEnabled: false
    }
  }

  /**
   * Generates the client assertion using the provided certificate.
   * @param authConfig The authentication configuration.
   * @returns The client assertion.
   */
  private getAssertionFromCert (authConfig: AuthConfiguration): string {
    const base64url = (buf: Buffer) =>
      buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')

    const privateKeyPem = fs.readFileSync(authConfig.certKeyFile as string)

    const pemFile = fs.readFileSync(authConfig.certPemFile as string)
    const pubKeyObject = new crypto.X509Certificate(pemFile)

    const der = pubKeyObject.raw
    const x5tS256 = base64url(crypto.createHash('sha256').update(der).digest())

    let x5c
    if (authConfig.sendX5C) {
      x5c = pemFile.toString()
    }

    const now = Math.floor(Date.now() / 1000)
    const payload = {
      aud: `${this.resolveAuthority(authConfig.tenantId)}/oauth2/v2.0/token`,
      iss: authConfig.clientId,
      sub: authConfig.clientId,
      jti: randomUUID(),
      nbf: now,
      iat: now,
      exp: now + 600, // 10 minutes
    }

    return jwt.sign(
      payload,
      privateKeyPem,
      {
        algorithm: 'PS256',
        header: { alg: 'PS256', typ: 'JWT', 'x5t#S256': x5tS256, x5c }
      }
    )
  }

  /**
   * Acquires a token using a user-assigned identity.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireTokenWithUserAssignedIdentity (authConfig: AuthConfiguration, scope: string) {
    const mia = new ManagedIdentityApplication({
      managedIdentityIdParams: {
        userAssignedClientId: authConfig.clientId || ''
      },
      system: this.sysOptions
    })
    const token = await mia.acquireToken({
      resource: scope
    })
    return token?.accessToken
  }

  /**
   * Acquires a token using a system-assigned identity.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireTokenWithSystemAssignedIdentity (authConfig: AuthConfiguration, scope: string) {
    const mia = new ManagedIdentityApplication({
      system: this.sysOptions
    })
    const token = await mia.acquireToken({
      resource: scope
    })
    return token?.accessToken
  }

  /**
   * Acquires a token using a certificate.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireTokenWithCertificate (authConfig: AuthConfiguration, scope: string) {
    const cca = this.getCertificateClient(authConfig)
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: randomUUID(),
      azureRegion: authConfig.azureRegion
    })
    if (!token?.accessToken) {
      throw new Error('Failed to acquire token using certificate')
    }
    return token.accessToken
  }

  /**
   * Acquires a token using a client secret.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireAccessTokenViaSecret (authConfig: AuthConfiguration, scope: string) {
    const cca = this.getClientSecretClient(authConfig)
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: randomUUID(),
      azureRegion: authConfig.azureRegion
    })
    if (!token?.accessToken) {
      throw new Error('Failed to acquire token using client secret')
    }
    return token.accessToken
  }

  /**
   * Acquires a token using a FIC client assertion.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireAccessTokenViaFIC (authConfig: AuthConfiguration, scope: string) : Promise<string> {
    const scopes = [`${scope}/.default`]
    const clientAssertion = await this.fetchExternalToken(authConfig.federatedClientId as string || authConfig.FICClientId as string)
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: `${authConfig.authorityEndpoint ?? authConfig.authority}/${authConfig.tenantId}`,
        clientAssertion
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({ scopes, azureRegion: authConfig.azureRegion })
    logger.debug('got token using FIC client assertion')
    if (!token?.accessToken) {
      throw new Error('Failed to acquire token using FIC client assertion')
    }
    return token.accessToken
  }

  /**
   * Acquires a token using a Workload Identity client assertion.
   * @param authConfig The authentication configuration.
   * @param scope The scope for the token.
   * @returns A promise that resolves to the access token.
   */
  private async acquireAccessTokenViaWID (authConfig: AuthConfiguration, scope: string) : Promise<string> {
    const scopes = [`${scope}/.default`]
    const tokenFilePath = authConfig.federatedTokenFile ?? authConfig.WIDAssertionFile
    const clientAssertion = fs.readFileSync(tokenFilePath as string, 'utf8')
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: `https://login.microsoftonline.com/${authConfig.tenantId}`,
        clientAssertion
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({ scopes, azureRegion: authConfig.azureRegion })
    logger.debug('got token using WID client assertion')
    if (!token?.accessToken) {
      throw new Error('Failed to acquire token using WID client assertion')
    }
    return token.accessToken
  }

  /**
   * Fetches an external token.
   * @param FICClientId The FIC client ID.
   * @returns A promise that resolves to the external token.
   */
  private async fetchExternalToken (FICClientId: string) : Promise<string> {
    const managedIdentityClientAssertion = new ManagedIdentityApplication({
      managedIdentityIdParams: {
        userAssignedClientId: FICClientId
      },
      system: this.sysOptions
    }
    )
    const response = await managedIdentityClientAssertion.acquireToken({
      resource: audience,
      forceRefresh: true
    })
    logger.debug('got token for FIC')
    if (!response?.accessToken) {
      throw new Error('Failed to acquire external token for FIC client assertion')
    }
    return response.accessToken
  }
}
