/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponseBase } from './taskModuleResponseBase'
import { TaskModuleTaskInfo } from './taskModuleTaskInfo'

/**
 * Interface representing the continue response of a task module.
 */
export interface TaskModuleContinueResponse extends TaskModuleResponseBase {
  /**
   * The task module task information.
   */
  value?: TaskModuleTaskInfo
}
