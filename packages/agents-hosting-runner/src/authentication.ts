// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { authorizeJWT, type AuthConfiguration, type Request } from '@microsoft/agents-hosting'
import { debug } from '@microsoft/agents-telemetry'
import { type RequestHandler } from 'express'
import { Errors } from './errorHelper'

const logger = debug('agents:hosting-runner')
const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const botIssuer = 'https://api.botframework.com'

export function validateRunnerIdentity (settings: AuthConfiguration, additionalIssuers: readonly string[]): void {
  for (const property of ['clientId', 'tenantId'] as const) {
    if (!guid.test(settings[property] ?? '')) {
      throw ExceptionHelper.generateException(Error, Errors.InvalidIdentity, undefined, { property })
    }
  }
  for (const issuer of additionalIssuers) {
    if (!URL.canParse(issuer) || new URL(issuer).protocol !== 'https:') {
      throw ExceptionHelper.generateException(Error, Errors.InvalidAdditionalIssuers)
    }
  }
}

export function createRunnerAuthentication (
  settings: AuthConfiguration,
  additionalIssuers: readonly string[]
): RequestHandler {
  validateRunnerIdentity(settings, additionalIssuers)
  const issuers = [
    botIssuer,
    `https://sts.windows.net/${settings.tenantId}/`,
    `https://login.microsoftonline.com/${settings.tenantId}/v2.0`,
    ...additionalIssuers
  ]
  const connection: AuthConfiguration = {
    clientId: settings.clientId,
    tenantId: settings.tenantId,
    authorityEndpoint: 'https://login.microsoftonline.com',
    issuers,
    validateIssuer: true
  }
  const authorize = authorizeJWT({
    ...connection,
    connections: new Map([['ServiceConnection', connection]])
  })

  return async (req, res, next) => {
    const request: Request = req
    await authorize(request, res, error => {
      if (error) {
        next(error)
        return
      }
      const user = request.user
      // SDK defaults also trust first-party tenants. The runner deliberately requires
      // the narrower deployment allow-list and an explicit token expiration.
      if (!user || !issuers.includes(user.iss ?? '') ||
        typeof user.exp !== 'number' || !Number.isFinite(user.exp)) {
        logger.warn('Rejected token outside runner issuer/lifetime policy')
        res.status(401).send({ 'jwt-auth-error': 'unauthorized' })
        return
      }
      next()
    })
  }
}
