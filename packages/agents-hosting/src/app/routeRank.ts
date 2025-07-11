/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export enum RouteRank {
  /**
   * Minimum rank value, used to specify the rank that must be evaluated first.
   */
  First = 0,

  /**
   * Maximum rank value, used to ensure routes with higher ranks are evaluated last.
   */
  Last = Number.MAX_VALUE,

  /**
   * Unspecified rank value, used for routes that do not have a specific rank assigned.
   */
  Unspecified = Number.MAX_VALUE / 2
}
