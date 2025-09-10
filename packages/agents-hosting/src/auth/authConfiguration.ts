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
  clientId: string

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
  FICClientId?: string,

  /**
   * Entra Authentication Endpoint to use.
   *
   * @remarks
   * If not populated the Entra Public Cloud endpoint is assumed.
   * This example of Public Cloud Endpoint is https://login.microsoftonline.com
   * see also https://learn.microsoft.com/entra/identity-platform/authentication-national-cloud
   */
  authority?: string
}

/**
 * Loads the authentication configuration from environment variables.
 *
 * @returns The authentication configuration.
 * @throws Will throw an error if clientId is not provided in production.
 *
 * @remarks
 * - `clientId` is required
 *
 * @example
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
 * authority=your-authority-endpoint
 * ```
 *
 */
export const loadAuthConfigFromEnv: (cnxName?: string) => AuthConfiguration = (cnxName?: string) => {
  if (cnxName === undefined) {
    const authority = process.env.authorityEndpoint ?? 'https://login.microsoftonline.com'
    if (process.env.clientId === undefined && process.env.NODE_ENV === 'production') {
      throw new Error('ClientId required in production')
    }
    return {
      tenantId: process.env.tenantId,
      clientId: process.env.clientId!,
      clientSecret: process.env.clientSecret,
      certPemFile: process.env.certPemFile,
      certKeyFile: process.env.certKeyFile,
      connectionName: process.env.connectionName,
      FICClientId: process.env.FICClientId,
      authority,
      issuers: [
        'https://api.botframework.com',
        `https://sts.windows.net/${process.env.tenantId}/`,
        `${authority}/${process.env.tenantId}/v2.0`
      ],
    }
  } else {
    const authority = process.env[`${cnxName}_authorityEndpoint`] ?? 'https://login.microsoftonline.com'
    return {
      tenantId: process.env[`${cnxName}_tenantId`],
      clientId: process.env[`${cnxName}_clientId`] ?? (() => { throw new Error(`ClientId not found for connection: ${cnxName}`) })(),
      clientSecret: process.env[`${cnxName}_clientSecret`],
      certPemFile: process.env[`${cnxName}_certPemFile`],
      certKeyFile: process.env[`${cnxName}_certKeyFile`],
      connectionName: process.env[`${cnxName}_connectionName`],
      FICClientId: process.env[`${cnxName}_FICClientId`],
      authority,
      issuers: [
        'https://api.botframework.com',
        `https://sts.windows.net/${process.env[`${cnxName}_tenantId`]}/`,
        `${authority}/${process.env[`${cnxName}_tenantId`]}/v2.0`
      ]
    }
  }
}

/**
 * Loads the agent authentication configuration from previous version environment variables.
 *
 * @returns The agent authentication configuration.
 * @throws Will throw an error if MicrosoftAppId is not provided in production.
 *
 * @example
 * ```
 * MicrosoftAppId=your-client-id
 * MicrosoftAppPassword=your-client-secret
 * MicrosoftAppTenantId=your-tenant-id
 * ```
 *
 */
export const loadPrevAuthConfigFromEnv: () => AuthConfiguration = () => {
  if (process.env.MicrosoftAppId === undefined && process.env.NODE_ENV === 'production') {
    throw new Error('ClientId required in production')
  }
  const authority = process.env.authorityEndpoint ?? 'https://login.microsoftonline.com'
  return {
    tenantId: process.env.MicrosoftAppTenantId,
    clientId: process.env.MicrosoftAppId!,
    clientSecret: process.env.MicrosoftAppPassword,
    certPemFile: process.env.certPemFile,
    certKeyFile: process.env.certKeyFile,
    connectionName: process.env.connectionName,
    FICClientId: process.env.MicrosoftAppClientId,
    authority,
    issuers: [
      'https://api.botframework.com',
      `https://sts.windows.net/${process.env.MicrosoftAppTenantId}/`,
      `${authority}/${process.env.MicrosoftAppTenantId}/v2.0`
    ]
  }
}
