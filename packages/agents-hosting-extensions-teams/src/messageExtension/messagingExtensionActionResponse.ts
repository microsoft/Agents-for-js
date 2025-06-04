/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleContinueResponse, TaskModuleMessageResponse } from '../taskModule'
import { MessagingExtensionResult } from './messagingExtensionResult'

/**
 * Represents the response of a messaging extension action.
 */
export interface MessagingExtensionActionResponse {
  /**
   * The task module response.
   */
  task?: TaskModuleContinueResponse | TaskModuleMessageResponse
  /**
   * The result of the compose extension.
   */
  composeExtension?: MessagingExtensionResult
  /**
   * Cache information for the response.
   */
  cacheInfo?: unknown // CacheInfo TODO: Define the type for CacheInfo
}
