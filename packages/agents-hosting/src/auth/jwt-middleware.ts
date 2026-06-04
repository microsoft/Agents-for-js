/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration, resolveAuthority } from './authConfiguration'
import { Request } from './request'
import { WebResponse, NextFunction } from '../interfaces/webResponse'
import { Errors } from '../errorHelper'
import { ExceptionHelper } from '@microsoft/agents-activity'
import jwksRsa, { JwksClient, SigningKey } from 'jwks-rsa'
import jwt, { JwtHeader, JwtPayload, SignCallback, GetPublicKeyOrSecret } from 'jsonwebtoken'
import { debug } from '@microsoft/agents-telemetry'

const logger = debug('agents:jwt-middleware')

/**
 * Builds the JWKS URI for the given token issuer and auth configuration.
 * @param iss The token issuer claim.
 * @param authConfig The authentication configuration for the matched audience.
 * @returns The JWKS URI string.
 */
export function buildJwksUri (iss: string, authConfig: AuthConfiguration): string {
  return iss === 'https://api.botframework.com'
    ? 'https://login.botframework.com/v1/.well-known/keys'
    : `${resolveAuthority(authConfig.authority, authConfig.tenantId)}/discovery/v2.0/keys`
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

  const jwksUri = buildJwksUri(payload.iss as string, authConfig)

  logger.debug(`fetching keys from ${jwksUri}`)
  const jwksClient: JwksClient = jwksRsa({ jwksUri })

  const getKey: GetPublicKeyOrSecret = (header: JwtHeader, callback: SignCallback) => {
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

  return await new Promise((resolve, reject) => {
    jwt.verify(raw, getKey, verifyOptions, (err, user) => {
      if (err) {
        logger.error('jwt.verify ', JSON.stringify(err))
        reject(err)
        return
      }
      resolve(user as JwtPayload)
    })
  })
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
 * Extracts the bearer token from a raw `Authorization` header value.
 *
 * Node's HTTP stack usually collapses duplicate headers into a single
 * comma-joined string, but the {@link Request} contract (and frameworks such as
 * Fastify) allow `string | string[] | undefined`. This normalizes those shapes
 * and validates the `Bearer <token>` scheme, returning `undefined` for anything
 * malformed so the caller can emit a consistent 401 instead of throwing.
 * @param authorization The raw `Authorization` header value.
 * @returns The bearer token, or `undefined` if the header is absent or malformed.
 */
function extractBearerToken (authorization: string | string[] | undefined): string | undefined {
  const headerValue = Array.isArray(authorization) ? authorization[0] : authorization
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
          const wireMessage: string | undefined = err?.description ?? err?.message
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
