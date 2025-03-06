/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Enum representing different Power Platform cloud environments.
 */
export enum PowerPlatformCloud {
  /**
   * Unknown cloud environment.
   */
  Unknown = -1,
  /**
   * Experimental cloud environment.
   */
  Exp = 0,
  /**
   * Development cloud environment.
   */
  Dev = 1,
  /**
   * Test cloud environment.
   */
  Test = 2,
  /**
   * Pre-production cloud environment.
   */
  Preprod = 3,
  /**
   * First release cloud environment.
   */
  FirstRelease = 4,
  /**
   * Production cloud environment.
   */
  Prod = 5,
  /**
   * Government cloud environment.
   */
  Gov = 6,
  /**
   * High security cloud environment.
   */
  High = 7,
  /**
   * Department of Defense cloud environment.
   */
  DoD = 8,
  /**
   * Mooncake cloud environment.
   */
  Mooncake = 9,
  /**
   * Ex cloud environment.
   */
  Ex = 10,
  /**
   * Rx cloud environment.
   */
  Rx = 11,
  /**
   * Private cloud environment.
   */
  Prv = 12,
  /**
   * Local cloud environment.
   */
  Local = 13,
  /**
   * French government cloud environment.
   */
  GovFR = 14,
  /**
   * Other cloud environment.
   */
  Other = 100
}
