/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CacheInfo } from '../agent-config/cacheInfo'
import { MessagingExtensionResult } from './messagingExtensionResult'

/**
 * Represents the response of a messaging extension.
 */
export interface MessagingExtensionResponse {
  /**
   * The result of the compose extension.
   */
  composeExtension?: MessagingExtensionResult
  /**
   * Cache information for the response.
   */
  cacheInfo?: CacheInfo
}
