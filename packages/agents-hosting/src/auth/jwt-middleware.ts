/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AuthConfiguration } from './authConfiguration'
import { Response, NextFunction } from 'express'
import { Request } from './request'
import jwksRsa, { JwksClient, SigningKey } from 'jwks-rsa'
import jwt, { JwtHeader, JwtPayload, SignCallback, GetPublicKeyOrSecret } from 'jsonwebtoken'
import { debug } from '../logger'

const logger = debug('agents:jwt-middleware')

/**
 * Verifies the JWT token.
 * @param raw The raw JWT token.
 * @param config The authentication configuration.
 * @returns A promise that resolves to the JWT payload.
 */
const verifyToken = async (raw: string, config: AuthConfiguration): Promise<JwtPayload> => {
  const getKey: GetPublicKeyOrSecret = (header: JwtHeader, callback: SignCallback) => {
    const payload = jwt.decode(raw) as JwtPayload

    const jwksUri: string = payload.iss === 'https://api.botframework.com'
      ? 'https://login.botframework.com/v1/.well-known/keys'
      : `https://login.microsoftonline.com/${config.tenantId}/discovery/v2.0/keys`

    logger.info(`fetching keys from ${jwksUri}`)
    const jwksClient: JwksClient = jwksRsa({ jwksUri })

    jwksClient.getSigningKey(header.kid, (err: Error | null, key: SigningKey | undefined): void => {
      if (err != null) {
        logger.error('jwksClient.getSigningKey ', JSON.stringify(err))
        logger.error(JSON.stringify(err))
        callback(err, undefined)
        return
      }
      const signingKey = key?.getPublicKey()
      callback(null, signingKey)
    })
  }

  return await new Promise((resolve, reject) => {
    const verifyOptions: jwt.VerifyOptions = {
      issuer: config.issuers,
      audience: [config.clientId!, 'https://api.botframework.com'],
      ignoreExpiration: false,
      algorithms: ['RS256'],
      clockTolerance: 300
    }

    jwt.verify(raw, getKey, verifyOptions, (err, user) => {
      if (err != null) {
        logger.error('jwt.verify ', JSON.stringify(err))
        reject(err)
        return
      }
      const tokenClaims = user as JwtPayload

      resolve(tokenClaims)
    })
  })
}

/**
 * Middleware to authorize JWT tokens.
 * @param authConfig The authentication configuration.
 * @returns An Express middleware function.
 */
export const authorizeJWT = (authConfig: AuthConfiguration) => {
  return async function (req: Request, res: Response, next: NextFunction) {
    let failed = false
    logger.info('authorizing jwt')
    const authHeader = req.headers.authorization as string
    if (authHeader) {
      const token: string = authHeader.split(' ')[1] // Extract the token from the Bearer string
      try {
        const user = await verifyToken(token, authConfig)
        logger.debug('token verified for ', user)
        req.user = user
      } catch (err: Error | any) {
        failed = true
        logger.error(err)
        res.status(401).send({ 'jwt-auth-error': err.message })
      }
    } else {
      if (!authConfig.clientId && process.env.NODE_ENV !== 'production') {
        logger.info('using anonymous auth')
        req.user = { name: 'anonymous' }
      } else {
        logger.error('authorization header not found')
        res.status(401).send({ 'jwt-auth-error': 'authorization header not found' })
      }
    }
    if (!failed) {
      next()
    }
  }
}
