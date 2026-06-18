/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { ConnectionSettingsBase } from '../settings'

/**
 * Connection settings for the MSAL-backed authentication providers (the default providers used for
 * every {@link AuthType} except `EntraAuthSideCar`).
 *
 * @remarks
 * Mirrors the .NET `Microsoft.Agents.Authentication.Msal.Model.ConnectionSettings` class. Node.js uses
 * PEM certificate files (`certPemFile`/`certKeyFile`) rather than the Windows certificate store, so the
 * .NET `CertThumbprint`/`CertSubjectName`/`CertStoreName`/`ValidCertificateOnly` settings have no JS
 * equivalent; all other MSAL properties map one-to-one.
 */
export interface MsalConnectionSettings extends ConnectionSettingsBase {
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
   * Indicates whether to send the X5C param or not (for SNI authentication).
   */
  sendX5C?: boolean

  /**
   * @deprecated Use federatedClientId instead.
   *
   * The FIC (First-Party Integration Channel) client ID.
   */
  FICClientId?: string

  /**
   * @deprecated Use `authType` set to `'WorkloadIdentity'` and `federatedTokenFile` instead.
   *
   * The path to K8s provided token.
   */
  WIDAssertionFile?: string

  /**
   * The Azure region for ESTS-R regional token acquisition (e.g. 'westus', 'eastus').
   * When set, MSAL routes token requests to the specified regional endpoint.
   * See https://learn.microsoft.com/en-us/entra/msal/javascript/node/regional-authorities for details.
   */
  azureRegion?: string

  /**
   * The path to the federated token file used for Workload Identity authentication.
   */
  federatedTokenFile?: string

  /**
   * Sets the resource URL for Identity Proxy Manager (IDPM).
   *
   * @remarks
   * Set this to the appropriate resource identifier when the application is running in an environment,
   * such as a Foundry container, that exposes Managed Identity through a container-specific IMDS endpoint.
   * This setting is only meaningful when using Identity Proxy Manager (AuthType.IdentityProxyManager) for authentication.
   */
  idpmResource?: string

  /**
   * The federated client ID for the authentication configuration, used for workload identity federation scenarios.
   */
  federatedClientId?: string
}
