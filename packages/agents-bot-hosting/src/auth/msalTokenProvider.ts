/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { ConfidentialClientApplication, LogLevel, ManagedIdentityApplication, NodeSystemOptions } from '@azure/msal-node'
import { AuthConfiguration } from './authConfiguration'
import { AuthProvider } from './authProvider'
import { debug } from '../logger'
import { v4 } from 'uuid'

import fs from 'fs'
import crypto from 'crypto'

const audience = 'api://AzureADTokenExchange'
const logger = debug('agents:msal-token-provider')

export class MsalTokenProvider implements AuthProvider {
  async getAccessToken (authConfig: AuthConfiguration, scope: string): Promise<string> {
    if (!authConfig.clientId && process.env.NODE_ENV !== 'production') {
      return ''
    }

    if (authConfig.FICClientId !== undefined) {
      return await this.acquireAccessTokenViaFIC(authConfig, scope)
    } else if (authConfig.clientSecret !== undefined) {
      return await this.acquireAccessTokenViaSecret(authConfig, scope)
    } else if (authConfig.certPemFile !== undefined &&
      authConfig.certKeyFile !== undefined) {
      return await this.acquireTokenWithCertificate(authConfig, scope)
    } else if (authConfig.clientSecret === undefined &&
      authConfig.certPemFile === undefined &&
      authConfig.certKeyFile === undefined) {
      return await this.acquireTokenWithUserAssignedIdentity(authConfig, scope)
    } else {
      throw new Error('Invalid authConfig. ')
    }
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
            logger.info(message)
            return
          case LogLevel.Warning:
            logger.warn(message)
        }
      },
      piiLoggingEnabled: false
    }
  }

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

    const pubKeyObject = new crypto.X509Certificate(fs.readFileSync(authConfig.certPemFile as string))
    console.log(pubKeyObject.fingerprint)

    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId || '',
        authority: `https://login.microsoftonline.com/${authConfig.tenantId || 'botframework.com'}`,
        clientCertificate: {
          privateKey: privateKey as string,
          thumbprint: pubKeyObject.fingerprint.replaceAll(':', ''),
          x5c: Buffer.from(authConfig.certPemFile as string, 'base64').toString()
        }
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: v4()
    })
    return token?.accessToken as string
  }

  private async acquireAccessTokenViaSecret (authConfig: AuthConfiguration, scope: string) {
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: `https://login.microsoftonline.com/${authConfig.tenantId || 'botframework.com'}`,
        clientSecret: authConfig.clientSecret
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({
      scopes: [`${scope}/.default`],
      correlationId: v4()
    })
    return token?.accessToken as string
  }

  private async acquireAccessTokenViaFIC (authConfig: AuthConfiguration, scope: string) : Promise<string> {
    const scopes = [`${scope}/.default`]
    const clientAssertion = await this.fetchExternalToken(authConfig.FICClientId as string)
    const cca = new ConfidentialClientApplication({
      auth: {
        clientId: authConfig.clientId as string,
        authority: `https://login.microsoftonline.com/${authConfig.tenantId}`,
        clientAssertion
      },
      system: this.sysOptions
    })
    const token = await cca.acquireTokenByClientCredential({ scopes })
    logger.info('got token using FIC client assertion')
    return token?.accessToken as string
  }

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
    logger.info('got token for FIC')
    return response.accessToken
  }
}
