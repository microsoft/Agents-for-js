/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './authConfiguration'
import { getDefaultIssuers, resolveAuthority } from './settings'
import { Request } from './request'
import { WebResponse, NextFunction } from '../interfaces/webResponse'
import { Errors } from '../errorHelper'
import { ExceptionHelper } from '@microsoft/agents-activity'
import jwksRsa, { JwksClient, SigningKey } from 'jwks-rsa'
import jwt, { JwtHeader, JwtPayload, SignCallback, GetPublicKeyOrSecret } from 'jsonwebtoken'
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:jwt-middleware')
const jwksClients = new Map<string, JwksClient>()
const maxJwksClients = 100

/**
 * Clears process-wide JWKS clients.
 */
export function clearJwksClients (): void {
  jwksClients.clear()
}

/**
 * Well-known Microsoft first-party token issuer tenant IDs that are always trusted,
 * mirroring the default `ValidIssuers` set in the .NET SDK
 * (Microsoft.Agents.Hosting.AspNetCore `AspNetExtensions.AddAgentAspNetAuthentication`).
 *
 * These identify Microsoft infrastructure tenants used by Azure Bot Service, Teams and
 * skill/agent-to-agent flows. They are accepted in addition to a connection's configured
 * issuers so that enabling issuer validation does not reject legitimate first-party traffic.
 */
const WELL_KNOWN_PUBLIC_TENANT_IDS = [
  'd6d49420-f39b-4df7-a1dc-d59a935871db',
  'f8cdef31-a31e-4b4a-93e4-5f571e91255a',
  '69e9b82d-4842-4902-8d1e-abc5b98a55e8'
]
const WELL_KNOWN_GOV_TENANT_ID = 'cab8a31a-1906-4287-a0d8-4eef66b95f6e'

/**
 * Determines whether the configured authority targets the Azure US Government cloud.
 * @param authority The configured Entra authority.
 * @returns `true` when the authority is a US Government endpoint.
 */
function isGovAuthority (authority?: string): boolean {
  return !!authority && /login\.microsoftonline\.us/i.test(authority)
}

function getAuthority (authConfig: AuthConfiguration): string | undefined {
  return authConfig.authorityEndpoint ?? authConfig.authority
}

/**
 * Returns the well-known Microsoft first-party issuers that are always trusted for the
 * cloud implied by `authority` (public by default, US Government when the authority is gov).
 * @param authority The configured Entra authority.
 * @returns The well-known first-party issuer list.
 */
function getWellKnownFirstPartyIssuers (authority?: string): string[] {
  if (isGovAuthority(authority)) {
    return [
      'https://api.botframework.us',
      `https://sts.windows.net/${WELL_KNOWN_GOV_TENANT_ID}/`,
      `https://login.microsoftonline.us/${WELL_KNOWN_GOV_TENANT_ID}/v2.0`
    ]
  }
  return [
    'https://api.botframework.com',
    ...WELL_KNOWN_PUBLIC_TENANT_IDS.flatMap((t) => [
      `https://sts.windows.net/${t}/`,
      `https://login.microsoftonline.com/${t}/v2.0`
    ])
  ]
}

/**
 * Computes the lowercase issuer allow-list used to validate a token's `iss` claim against a
 * matched connection. The list is the connection's configured issuers (or a tenant-scoped
 * default when none are configured) unioned with the always-trusted Microsoft first-party
 * issuers. Comparison is performed case-insensitively to tolerate operator-provided tenant
 * GUID casing while still rejecting tokens from unrelated tenants.
 * @param authConfig The matched connection configuration.
 * @returns A de-duplicated, lowercased list of accepted issuers.
 */
function getValidIssuers (authConfig: AuthConfiguration): string[] {
  const authority = getAuthority(authConfig)
  const configured = authConfig.issuers && authConfig.issuers.length > 0
    ? authConfig.issuers
    : getDefaultIssuers(authConfig.tenantId ?? '', authority ?? 'https://login.microsoftonline.com')
  const accepted = new Set<string>()
  for (const issuer of [...configured, ...getWellKnownFirstPartyIssuers(authority)]) {
    accepted.add(issuer.toLowerCase())
  }
  return [...accepted]
}

/**
 * Returns the effective tenant identifier for a connection: the tenant embedded in the authority
 * path when present (which takes precedence, matching {@link resolveAuthority}), otherwise the
 * configured `tenantId`.
 * @param authConfig The matched connection configuration.
 * @returns The effective tenant identifier, or `undefined` when none is configured.
 */
function getEffectiveTenant (authConfig: AuthConfiguration): string | undefined {
  const authority = getAuthority(authConfig)
  if (authority) {
    try {
      const segment = new URL(authority.replace(/\/+$/, '')).pathname.split('/').filter(Boolean).pop()
      if (segment) {
        return segment
      }
    } catch {
      // Non-URL authority — fall through to the configured tenantId.
    }
  }
  return authConfig.tenantId
}

/**
 * Determines whether a connection is configured as a multi-tenant ("blueprint") agent, i.e. its
 * effective tenant is the Entra `common` or `organizations` meta-tenant. For such agents the
 * calling tenant is not known at configuration time, so the strict issuer allow-list cannot
 * enumerate it and issuer validation must instead accept any canonical Entra issuer for the
 * configured cloud (still bound to the token's `tid` by {@link validateTenantBinding} and anchored
 * by the signature and audience checks).
 * @param authConfig The matched connection configuration.
 * @returns `true` when the connection targets the `common`/`organizations` meta-tenant.
 */
function isMultiTenant (authConfig: AuthConfiguration): boolean {
  const tenant = getEffectiveTenant(authConfig)?.toLowerCase()
  return tenant === 'common' || tenant === 'organizations'
}

/**
 * Determines whether `iss` is a canonical Entra issuer that may be accepted for a multi-tenant
 * connection. The issuer must carry a concrete tenant GUID and, for cloud-specific v2 issuers,
 * belong to the same cloud as the configured authority (public vs US Government). The cloud-
 * agnostic v1 `sts.windows.net` host is accepted in either cloud.
 * @param iss The token issuer claim.
 * @param authConfig The matched connection configuration.
 * @returns `true` when the issuer is an acceptable Entra tenant issuer for the configured cloud.
 */
function isAcceptableTenantIssuer (iss: string, authConfig: AuthConfiguration): boolean {
  const info = getEntraIssuerInfo(iss)
  if (!info) {
    return false
  }
  return info.gov === undefined || info.gov === isGovAuthority(getAuthority(authConfig))
}

/**
 * Validates that the token's `iss` claim is present and acceptable for the matched connection.
 * Without this check a signature-valid token from any tenant (Entra signing keys are shared across
 * tenants in a cloud) with a matching audience would be accepted, enabling a cross-tenant
 * authentication bypass for multi-tenant app registrations.
 *
 * For single-tenant connections the issuer must be in the connection's allow-list. For multi-tenant
 * ("blueprint") connections, where the calling tenant is unknown at configuration time, any
 * canonical Entra issuer for the configured cloud is also accepted; the token's tenant is then
 * bound to its `tid` claim by {@link validateTenantBinding} and ultimately anchored by the
 * signature and audience (clientId) checks.
 * @param iss The token issuer claim (from the decoded payload).
 * @param authConfig The matched connection configuration.
 * @throws When the issuer is missing, non-string, or not acceptable for the connection.
 */
function validateIssuer (iss: unknown, authConfig: AuthConfiguration): void {
  if (typeof iss === 'string') {
    if (getValidIssuers(authConfig).includes(iss.toLowerCase())) {
      return
    }
    if (isMultiTenant(authConfig) && isAcceptableTenantIssuer(iss, authConfig)) {
      return
    }
  }
  const err = ExceptionHelper.generateException(Error, Errors.JwtIssuerMismatch)
  logger.error(err.message, iss)
  throw err
}

/**
 * Matches a tenant GUID (the format Entra uses for the `tid` claim and the tenant segment of an
 * Entra issuer). Operator-configured issuers may instead use a tenant domain alias, which cannot
 * be compared to the GUID `tid` claim and is therefore left unbound.
 */
const ENTRA_TENANT_GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Cloud-affinity metadata for a recognised Entra issuer.
 */
interface EntraIssuerInfo {
  /** The lowercased tenant GUID embedded in the issuer. */
  tenant: string
  /**
   * `true` for US Government (`login.microsoftonline.us`) issuers, `false` for public
   * (`login.microsoftonline.com`) issuers, and `undefined` for the cloud-agnostic v1
   * `sts.windows.net` host (which is shared across the public and US Government clouds).
   */
  gov?: boolean
}

/**
 * Parses a recognised public or US Government Entra issuer into its tenant GUID and cloud affinity,
 * or returns `undefined` when the issuer is not such an Entra issuer or does not embed a tenant
 * GUID.
 *
 * Only GUID tenants are recognised: the token's `tid` claim is always the tenant GUID, so an issuer
 * whose tenant segment is a domain alias (e.g. `contoso.onmicrosoft.com`) cannot be compared to
 * `tid` and is intentionally left unrecognised to preserve compatibility. Non-Entra issuers such as
 * the Azure Bot Service `api.botframework.*` issuers carry no `tid` claim and are not matched here.
 * @param iss The token issuer claim.
 * @returns The issuer's tenant and cloud affinity, or `undefined` when not a recognised Entra issuer.
 */
function getEntraIssuerInfo (iss: string): EntraIssuerInfo | undefined {
  const v1 = /^https:\/\/sts\.windows\.net\/([^/]+)\/$/i.exec(iss)
  if (v1) {
    return ENTRA_TENANT_GUID.test(v1[1]) ? { tenant: v1[1].toLowerCase() } : undefined
  }
  const v2 = /^([^:]+):\/\/([^/]+)\/([^/]+)\/v2\.0$/.exec(iss)
  const v2Host = v2 ? /^login\.microsoftonline\.(com|us)$/i.exec(v2[2]) : undefined
  if (v2 && v2Host && v2[1].toLowerCase() === 'https' && ENTRA_TENANT_GUID.test(v2[3])) {
    return { tenant: v2[3].toLowerCase(), gov: v2Host[1].toLowerCase() === 'us' }
  }
  return undefined
}

/**
 * Extracts the tenant GUID embedded in a recognised public or US Government Entra issuer, or
 * `undefined` when the issuer is not such an Entra issuer or does not embed a tenant GUID.
 * @param iss The token issuer claim.
 * @returns The lowercased tenant GUID, or `undefined` when no bindable tenant is present.
 */
function getIssuerTenant (iss: string): string | undefined {
  return getEntraIssuerInfo(iss)?.tenant
}

/**
 * Validates that an Entra token's `tid` (tenant id) claim matches the tenant GUID embedded in its
 * `iss` claim. This binds the accepted issuer to the token's tenant. Because
 * Entra signing keys are shared across tenants within a cloud, requiring the issuer's tenant and
 * the `tid` claim to agree prevents a token whose `iss` was allow-listed (for example one of the
 * always-trusted Microsoft first-party tenants) from being accepted on behalf of a different
 * tenant.
 *
 * The binding only applies when both claims are strings and the issuer is a recognised Entra
 * issuer carrying a GUID tenant. Missing/non-string claims, Azure Bot Service issuers, and
 * alias-based issuers are skipped for backward compatibility.
 * @param iss The token issuer claim.
 * @param tid The token tenant id claim.
 * @throws When both claims are strings and the issuer embeds a tenant GUID different from `tid`.
 */
function validateTenantBinding (iss: unknown, tid: unknown): void {
  if (typeof iss !== 'string' || typeof tid !== 'string') {
    return
  }
  const issuerTenant = getIssuerTenant(iss)
  if (!issuerTenant) {
    return
  }
  if (tid.toLowerCase() !== issuerTenant) {
    const err = ExceptionHelper.generateException(Error, Errors.JwtTenantMismatch)
    logger.error(err.message, tid)
    throw err
  }
}

/**
 * Builds the JWKS URI for the given token issuer and auth configuration.
 * @param iss The token issuer claim.
 * @param authConfig The authentication configuration for the matched audience.
 * @returns The JWKS URI string.
 */
export function buildJwksUri (iss: string, authConfig: AuthConfiguration): string {
  switch (typeof iss === 'string' ? iss.toLowerCase() : '') {
    case 'https://api.botframework.com':
      return 'https://login.botframework.com/v1/.well-known/keys'
    case 'https://api.botframework.us':
      return 'https://login.botframework.azure.us/v1/.well-known/keys'
    default:
      return `${resolveAuthority(authConfig.authorityEndpoint ?? authConfig.authority, authConfig.tenantId)}/discovery/v2.0/keys`
  }
}

export function getJwksClient (jwksUri: string): JwksClient {
  // Check if a client for this JWKS URI already exists in the cache.
  let client = jwksClients.get(jwksUri)
  if (!client) {
    client = jwksRsa({ jwksUri })
    jwksClients.set(jwksUri, client)
    while (jwksClients.size > maxJwksClients) {
      const oldestKey = jwksClients.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      jwksClients.delete(oldestKey)
    }
  } else {
    jwksClients.delete(jwksUri)
    jwksClients.set(jwksUri, client)
  }
  return client
}

/**
 * Verifies the JWT token.
 * @param raw The raw JWT token.
 * @param config The authentication configuration.
 * @returns A promise that resolves to the JWT payload.
 */
const verifyToken = async (raw: string, config: AuthConfiguration): Promise<JwtPayload> => {
  const payload = jwt.decode(raw) as JwtPayload
  logger.debug('jwt.decode ', JSON.stringify(payload))

  if (!payload) {
    throw ExceptionHelper.generateException(Error, Errors.InvalidJwtToken)
  }
  const audience = payload.aud

  const matchingEntry = config.connections && config.connections.size > 0
    ? [...config.connections.entries()].find(([_, configuration]) => configuration.clientId === audience)
    : undefined

  if (!matchingEntry) {
    const err = ExceptionHelper.generateException(Error, Errors.JwtAudienceMismatch)
    logger.error(err.message, audience)
    throw err
  }

  const [key, authConfig] = matchingEntry
  logger.debug(`Audience found at key: ${key}`)

  const issuer = typeof payload.iss === 'string' ? payload.iss : ''
  const jwksUri = buildJwksUri(issuer, authConfig)

  logger.debug(`fetching keys from ${jwksUri}`)
  const jwksClient = getJwksClient(jwksUri)

  const getKey: GetPublicKeyOrSecret = (header: JwtHeader, callback: SignCallback) => {
    // Retrieve the public, issuer-wide signing key from the JWKS endpoint using the kid from the token header.
    jwksClient.getSigningKey(header.kid, (err: Error | null, key: SigningKey | undefined): void => {
      if (err) {
        logger.error('jwksClient.getSigningKey ', JSON.stringify(err))
        logger.error(JSON.stringify(err))
        callback(err, undefined)
        return
      }
      const signingKey = key?.getPublicKey()
      callback(null, signingKey)
    })
  }

  const verifyOptions: jwt.VerifyOptions = {
    audience: [authConfig.clientId!, 'https://api.botframework.com'],
    ignoreExpiration: false,
    algorithms: ['RS256'],
    clockTolerance: 300
  }

  const verifiedPayload = await new Promise<JwtPayload>((resolve, reject) => {
    jwt.verify(raw, getKey, verifyOptions, (err, user) => {
      if (err) {
        logger.error('jwt.verify ', JSON.stringify(err))
        reject(err)
        return
      }
      resolve(user as JwtPayload)
    })
  })

  if (authConfig.validateIssuer) {
    validateIssuer(verifiedPayload.iss, authConfig)
  }
  validateTenantBinding(verifiedPayload.iss, verifiedPayload.tid)
  return verifiedPayload
}

/**
 * Determines whether an `Authorization` header value is present (non-empty).
 *
 * The {@link Request} contract allows `string | string[] | undefined` because
 * different web frameworks surface headers differently. This treats an empty
 * string or empty array as "absent" so callers can distinguish a missing header
 * (anonymous / 401) from a present-but-malformed one (always 401).
 * @param authorization The raw `Authorization` header value.
 * @returns `true` when a non-empty header value is present.
 */
function hasAuthorizationHeader (authorization: string | string[] | undefined): boolean {
  if (Array.isArray(authorization)) {
    return authorization.some((value) => typeof value === 'string' && value.trim().length > 0)
  }
  return typeof authorization === 'string' && authorization.trim().length > 0
}

/**
 * Parses a single `Authorization` header value and returns its bearer token.
 *
 * Validates the `Bearer <token>` scheme, returning `undefined` for anything
 * malformed (wrong scheme, missing token, or extra whitespace-delimited parts).
 * @param headerValue A single `Authorization` header value.
 * @returns The bearer token, or `undefined` if the value is absent or malformed.
 */
function parseBearerValue (headerValue: string | undefined): string | undefined {
  if (typeof headerValue !== 'string') {
    return undefined
  }
  const parts = headerValue.trim().split(/\s+/)
  if (parts.length !== 2) {
    return undefined
  }
  const [scheme, token] = parts
  if (scheme.toLowerCase() !== 'bearer' || !token) {
    return undefined
  }
  return token
}

/**
 * Extracts the bearer token from a raw `Authorization` header value.
 *
 * On Node's core HTTP parser (which both Express and Fastify use) `Authorization`
 * is always surfaced as a single string holding the *first* header line —
 * duplicate `Authorization` headers are discarded, not comma-joined. The
 * `string[]` case is handled only because the {@link Request} contract permits
 * it for non-Node frameworks; when an array is supplied, every entry is inspected
 * and the first valid `Bearer <token>` is returned (the bearer value is not
 * assumed to be first). Returns `undefined` for anything malformed so the caller
 * can emit a consistent 401 instead of throwing.
 * @param authorization The raw `Authorization` header value.
 * @returns The bearer token, or `undefined` if the header is absent or malformed.
 */
function extractBearerToken (authorization: string | string[] | undefined): string | undefined {
  const values = Array.isArray(authorization) ? authorization : [authorization]
  for (const value of values) {
    const token = parseBearerValue(value)
    if (token) {
      return token
    }
  }
  return undefined
}

/**
 * Middleware to authorize JWT tokens.
 * @param authConfig The authentication configuration.
 * @returns An Express middleware function.
 */
export const authorizeJWT = (authConfig: AuthConfiguration) => {
  return async function (req: Request, res: WebResponse, next: NextFunction) {
    let failed = false
    logger.debug('authorizing jwt')
    if (req.method !== 'POST' && req.method !== 'GET') {
      failed = true
      logger.warn('Method not allowed', req.method)
      res.status(405).send({ 'jwt-auth-error': 'Method not allowed' })
    } else {
      const token = extractBearerToken(req.headers.authorization)
      if (token) {
        try {
          const user = await verifyToken(token, authConfig)
          logger.debug('token verified for ', user)
          req.user = user
        } catch (err: Error | any) {
          failed = true
          logger.error(err)
          // Emit only the human-readable description rather than the
          // ExceptionHelper-formatted "[code] - description - helplink" string,
          // so the wire format does not leak internal error codes or help links.
          // Fall back to a stable string so a thrown non-Error (no description/
          // message) never serializes to an empty `{}` and drops the detail.
          const wireMessage: string = err?.description ?? err?.message ?? 'unauthorized'
          res.status(401).send({ 'jwt-auth-error': wireMessage })
        }
      } else if (hasAuthorizationHeader(req.headers.authorization)) {
        // Header is present but not a well-formed `Bearer <token>` (e.g. wrong
        // scheme, missing token, or an array value). Respond with a consistent
        // 401 rather than letting malformed input throw before authorization.
        failed = true
        logger.warn('malformed authorization header')
        res.status(401).send({ 'jwt-auth-error': 'invalid authorization header' })
      } else {
        if (!authConfig.clientId && process.env.NODE_ENV !== 'production') {
          logger.info('using anonymous auth')
          req.user = { name: 'anonymous' }
        } else {
          failed = true
          logger.error('authorization header not found')
          res.status(401).send({ 'jwt-auth-error': 'authorization header not found' })
        }
      }
    }
    if (!failed) {
      next()
    }
  }
}
