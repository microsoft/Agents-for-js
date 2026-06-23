/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfidentialClientApplication, LogLevel, ManagedIdentityApplication, NodeSystemOptions } from '@azure/msal-node'
import { AuthConfiguration, AuthType, resolveAuthority as resolveAuthorityUtil } from './authConfiguration'
import { AuthProvider } from './authProvider'
import { debug, trace } from '@microsoft/agents-telemetry'
import { randomUUID } from 'crypto'
import { MemoryCache } from './MemoryCache'
import jwt from 'jsonwebtoken'

import fs from 'fs'
import crypto from 'crypto'
import { AuthenticationTraceDefinitions } from '../observability'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper'

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
  private readonly _agenticTokenCache: MemoryCache<string>
  public readonly connectionSettings?: AuthConfiguration

  constructor (connectionSettings?: AuthConfiguration) {
    this._agenticTokenCache = new MemoryCache<string>()
    this.connectionSettings = connectionSettings
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
          throw ExceptionHelper.generateException(Error, Errors.ConnectionSettingsRequiredForGetAccessTokenScope)
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

      let token
      if (authConfig.authType) {
        record({ method: authConfig.authType })
        logger.debug(`getAccessToken via ${authConfig.authType} clientId=${authConfig.clientId} scope=${actualScope}`)
        switch (authConfig.authType) {
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
            throw ExceptionHelper.generateException(Error, Errors.UnsupportedAuthType, undefined, { authType: authConfig.authType })
        }
      } else if (authConfig.WIDAssertionFile !== undefined) {
        record({ method: AuthType.WorkloadIdentity })
        logger.debug('getAccessToken via method=%s clientId=%s scope=%s', AuthType.WorkloadIdentity, authConfig.clientId, actualScope)
        token = await this.acquireAccessTokenViaWID(authConfig, actualScope)
      } else if (authConfig.federatedClientId !== undefined || authConfig.FICClientId !== undefined) {
        record({ method: AuthType.FederatedCredentials })
        logger.debug('getAccessToken via method=%s clientId=%s scope=%s', AuthType.FederatedCredentials, authConfig.clientId, actualScope)
        token = await this.acquireAccessTokenViaFIC(authConfig, actualScope)
      } else if (authConfig.clientSecret !== undefined) {
        record({ method: AuthType.ClientSecret })
        logger.debug('getAccessToken via method=%s clientId=%s scope=%s', AuthType.ClientSecret, authConfig.clientId, actualScope)
        token = await this.acquireAccessTokenViaSecret(authConfig, actualScope)
      } else if (authConfig.certPemFile !== undefined &&
          authConfig.certKeyFile !== undefined) {
        record({ method: AuthType.Certificate })
        logger.debug('getAccessToken via method=%s clientId=%s scope=%s', AuthType.Certificate, authConfig.clientId, actualScope)
        token = await this.acquireTokenWithCertificate(authConfig, actualScope)
      } else if (authConfig.clientSecret === undefined &&
          authConfig.certPemFile === undefined &&
          authConfig.certKeyFile === undefined) {
        record({ method: AuthType.UserManagedIdentity })
        logger.debug('getAccessToken via method=%s clientId=%s scope=%s', AuthType.UserManagedIdentity, authConfig.clientId, actualScope)
        token = await this.acquireTokenWithUserAssignedIdentity(authConfig, actualScope)
      } else {
        throw ExceptionHelper.generateException(Error, Errors.InvalidAuthConfig)
      }
      if (token === undefined) {
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireToken)
      }

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
          throw ExceptionHelper.generateException(Error, Errors.ConnectionSettingsRequiredForAcquireTokenOnBehalfOf)
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

      const cca = new ConfidentialClientApplication({
        auth: {
          clientId: authConfig.clientId as string,
          authority: `${authConfig.authorityEndpoint ?? authConfig.authority}/${authConfig.tenantId || 'botframework.com'}`,
          clientSecret: authConfig.clientSecret
        },
        system: this.sysOptions
      })
      const token = await cca.acquireTokenOnBehalfOf({
        oboAssertion: actualOboAssertion,
        scopes: actualScopes
      })
      if (!token?.accessToken) {
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenOnBehalfOf)
      }

      return token.accessToken
    })
  }

  public async getAgenticInstanceToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    return trace(AuthenticationTraceDefinitions.getAgenticInstanceToken, async ({ record }) => {
      logger.debug('getAgenticInstanceToken tenantId=%s agentAppInstanceId=%s', tenantId, agentAppInstanceId)
      record({ agenticInstanceId: agentAppInstanceId })

      if (!this.connectionSettings) {
        throw ExceptionHelper.generateException(Error, Errors.ConnectionSettingsRequiredForGetAgenticInstanceToken)
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
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireInstanceTokenForAgentInstance, undefined, { agentAppInstanceId })
      }

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
      throw ExceptionHelper.generateException(Error, Errors.ConnectionSettingsRequiredForGetAgenticInstanceToken)
    }

    logger.debug('acquireTokenForAgenticScenarios clientId=%s tenantId=%s scopes=%o grant_type=%s', clientId, tenantId, scopes, tokenBodyParameters.grant_type)
    // Check cache first
    const cacheKey = `${clientId}/${Object.keys(tokenBodyParameters).map(key => key !== 'user_federated_identity_credential' ? `${key}=${tokenBodyParameters[key]}` : '').join('&')}/${scopes.join(';')}`
    if (this._agenticTokenCache.get(cacheKey)) {
      return this._agenticTokenCache.get(cacheKey) as string
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
    this._agenticTokenCache.set(cacheKey, token.access_token, token.expires_in - 300)
    return token.access_token
  }

  public async getAgenticUserToken (tenantId: string, agentAppInstanceId: string, agenticUserId: string, scopes: string[]): Promise<string> {
    return trace(AuthenticationTraceDefinitions.getAgenticUserToken, async ({ record }) => {
      logger.debug('getAgenticUserToken tenantId=%s agentAppInstanceId=%s scopes=%o', tenantId, agentAppInstanceId, scopes)
      record({ agenticInstanceId: agentAppInstanceId, agenticUserId, scopes })

      const agentToken = await this.getAgenticApplicationToken(tenantId, agentAppInstanceId)
      const instanceToken = await this.getAgenticInstanceToken(tenantId, agentAppInstanceId)

      const token = await this.acquireTokenForAgenticScenarios(tenantId, agentAppInstanceId, agentToken, scopes, {
        user_id: agenticUserId,
        user_federated_identity_credential: instanceToken,
        grant_type: 'user_fic',
      })

      if (!token) {
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireInstanceTokenForUserToken, undefined, { agentAppInstanceId })
      }

      return token
    })
  }

  public async getAgenticApplicationToken (tenantId: string, agentAppInstanceId: string): Promise<string> {
    if (!this.connectionSettings?.clientId) {
      throw ExceptionHelper.generateException(Error, Errors.ConnectionSettingsRequiredForGetAgenticApplicationToken)
    }
    logger.debug('getAgenticApplicationToken clientId=%s tenantId=%s agentAppInstanceId=%s', this.connectionSettings.clientId, tenantId, agentAppInstanceId)

    if (this.connectionSettings.authType === AuthType.IdentityProxyManager) {
      let resource: string
      if (!this.connectionSettings.idpmResource) {
        resource = 'api://AzureAdTokenExchange/.default'
      } else if (!URL.canParse(this.connectionSettings.idpmResource)) {
        throw ExceptionHelper.generateException(Error, Errors.IdpmResourceAbsoluteUriRequired)
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
        throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenViaIdentityProxyManagerForAgentInstance, undefined, { agentAppInstanceId })
      }
      logger.debug('getAgenticApplicationToken via IdentityProxyManager clientId=%s resource=%s', this.connectionSettings.clientId, resource)
      return tokenResult.accessToken
    }

    let clientAssertion

    if (this.connectionSettings.authType) {
      switch (this.connectionSettings.authType) {
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
    } else if (this.connectionSettings.WIDAssertionFile !== undefined) {
      const tokenFilePath = this.connectionSettings.federatedTokenFile ?? this.connectionSettings.WIDAssertionFile
      clientAssertion = fs.readFileSync(tokenFilePath as string, 'utf8')
    } else if (this.connectionSettings.federatedClientId !== undefined || this.connectionSettings.FICClientId !== undefined) {
      clientAssertion = await this.fetchExternalToken(this.connectionSettings.federatedClientId as string || this.connectionSettings.FICClientId as string)
    } else if (this.connectionSettings.certPemFile !== undefined &&
      this.connectionSettings.certKeyFile !== undefined) {
      clientAssertion = this.getAssertionFromCert(this.connectionSettings)
    }

    const token = await this.acquireTokenForAgenticScenarios(tenantId, this.connectionSettings.clientId, clientAssertion, ['api://AzureAdTokenExchange/.default'], {
      grant_type: 'client_credentials',
      fmi_path: agentAppInstanceId,
    })

    if (!token) {
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireInstanceTokenForAgentInstance, undefined, { agentAppInstanceId })
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

    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId || '',
        authority: `${authConfig.authorityEndpoint ?? authConfig.authority}/${authConfig.tenantId || 'botframework.com'}`,
        clientCertificate: {
          privateKey: privateKey as string,
          thumbprint: pubKeyObject.fingerprint.replaceAll(':', ''),
          x5c: pemFile.toString()
        }
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: randomUUID(),
      azureRegion: authConfig.azureRegion
    })
    if (!token?.accessToken) {
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenUsingCertificate)
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
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: `${authConfig.authorityEndpoint ?? authConfig.authority}/${authConfig.tenantId || 'botframework.com'}`,
        clientSecret: authConfig.clientSecret
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: randomUUID(),
      azureRegion: authConfig.azureRegion
    })
    if (!token?.accessToken) {
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenUsingClientSecret)
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
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenUsingFICClientAssertion)
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
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireTokenUsingWIDClientAssertion)
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
      throw ExceptionHelper.generateException(Error, Errors.FailedToAcquireExternalTokenForFICClientAssertion)
    }
    return response.accessToken
  }
}
