/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the authentication configuration.
 */
export interface AuthConfiguration {
  tenantId?: string
  clientId?: string
  clientSecret?: string
  certPemFile?: string
  certKeyFile?: string
  issuers: string[]
  connectionName?: string,
  FICClientId?: string
}

/**
 * Loads the authentication configuration from environment variables.
 * @returns The authentication configuration.
 * @throws Will throw an error if clientId is not provided in production.
 */
export const loadAuthConfigFromEnv: () => AuthConfiguration = () => {
  if (process.env.clientId === undefined && process.env.NODE_ENV === 'production') {
    throw new Error('ClientId required in production')
  }
  return {
    tenantId: process.env.tenantId,
    clientId: process.env.clientId,
    clientSecret: process.env.clientSecret,
    certPemFile: process.env.certPemFile,
    certKeyFile: process.env.certKeyFile,
    connectionName: process.env.connectionName,
    FICClientId: process.env.FICClientId,
    issuers: [
      'https://api.botframework.com',
      `https://sts.windows.net/${process.env.tenantId}/`,
      `https://login.microsoftonline.com/${process.env.tenantId}/v2.0`
    ]
  }
}

/**
 * Loads the bot authentication configuration from environment variables.
 * @returns The bot authentication configuration.
 * @throws Will throw an error if MicrosoftAppId is not provided in production.
 */
export const loadBotAuthConfigFromEnv: () => AuthConfiguration = () => {
  if (process.env.MicrosoftAppId === undefined && process.env.NODE_ENV === 'production') {
    throw new Error('ClientId required in production')
  }
  return {
    tenantId: process.env.MicrosoftAppTenantId,
    clientId: process.env.MicrosoftAppId,
    clientSecret: process.env.MicrosoftAppPassword,
    certPemFile: process.env.certPemFile,
    certKeyFile: process.env.certKeyFile,
    connectionName: process.env.connectionName,
    FICClientId: process.env.MicrosoftAppClientId,
    issuers: [
      'https://api.botframework.com',
        `https://sts.windows.net/${process.env.MicrosoftAppTenantId}/`,
        `https://login.microsoftonline.com/${process.env.MicrosoftAppTenantId}/v2.0`
    ]
  }
}
