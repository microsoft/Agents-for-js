/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CacheInfo } from '../agent-config/cacheInfo'
import { TaskModuleContinueResponse } from './taskModuleContinueResponse'
import { TaskModuleMessageResponse } from './taskModuleMessageResponse'

/**
 * Interface representing the response of a task module.
 */
export interface TaskModuleResponse {
  /**
   * The task module continue or message response.
   */
  task?: TaskModuleContinueResponse | TaskModuleMessageResponse
  /**
   * The cache information.
   */
  cacheInfo?: CacheInfo
}
