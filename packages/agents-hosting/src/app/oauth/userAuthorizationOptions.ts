/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Options for configuring user authorization.
 * Contains settings related to Single Sign-On (SSO) authentication.
 */
export interface UserAuthorizationOptions {
  /**
   * Determines whether Single Sign-On (SSO) is enabled for user authorization.
   */
  enableSSO: boolean;

  /**
   * The name of the SSO connection to use when SSO is enabled.
   * Only applicable when enableSSO is set to true.
   */
  ssoConnectionName?: string;
}
