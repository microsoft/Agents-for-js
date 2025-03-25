/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessagingExtensionResult } from './messagingExtensionResult'
import { TaskModuleContinueResponse } from '../task/taskModuleContinueResponse'
import { TaskModuleMessageResponse } from '../task/taskModuleMessageResponse'
import { CacheInfo } from '../agent-config/cacheInfo'

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
  cacheInfo?: CacheInfo
}
