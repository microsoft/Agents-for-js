/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the authentication configuration.
 */
export interface AuthConfiguration {
  /**
   * The tenant ID for the authentication configuration.
   */
  tenantId?: string

  /**
   * The client ID for the authentication configuration. Required in production.
   */
  clientId?: string

  /**
   * The client secret for the authentication configuration.
   */
  clientSecret?: string

  /**
   * The path to the certificate PEM file.
   */
  certPemFile?: string

  /**
   * The path to the certificate key file.
   */
  certKeyFile?: string

  /**
   * A list of valid issuers for the authentication configuration.
   */
  issuers: string[]

  /**
   * The connection name for the authentication configuration.
   */
  connectionName?: string

  /**
   * The FIC (First-Party Integration Channel) client ID.
   */
  FICClientId?: string

  /**
   * The path to K8s provided token.
   */
  WIDAssertionFile?: string
}

/**
 * Loads the authentication configuration from environment variables.
 * ```
 * tenantId=your-tenant-id
 * clientId=your-client-id
 * clientSecret=your-client-secret
 *
 * certPemFile=your-cert-pem-file
 * certKeyFile=your-cert-key-file
 *
 * FICClientId=your-FIC-client-id
 *
 * connectionName=your-connection-name
 * ```
 * @remarks
 * - `clientId` is required
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
    WIDAssertionFile: process.env.WIDAssertionFile,
    issuers: [
      'https://api.botframework.com',
      `https://sts.windows.net/${process.env.tenantId}/`,
      `https://login.microsoftonline.com/${process.env.tenantId}/v2.0`
    ]
  }
}

/**
 * Loads the agent authentication configuration from previous version environment variables.
 * ```
 * MicrosoftAppId=your-client-id
 * MicrosoftAppPassword=your-client-secret
 * MicrosoftAppTenantId=your-tenant-id
 * ```
 * @returns The agent authentication configuration.
 * @throws Will throw an error if MicrosoftAppId is not provided in production.
 */
export const loadPrevAuthConfigFromEnv: () => AuthConfiguration = () => {
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
    WIDAssertionFile: process.env.WIDAssertionFile,
    issuers: [
      'https://api.botframework.com',
      `https://sts.windows.net/${process.env.MicrosoftAppTenantId}/`,
      `https://login.microsoftonline.com/${process.env.MicrosoftAppTenantId}/v2.0`
    ]
  }
}
