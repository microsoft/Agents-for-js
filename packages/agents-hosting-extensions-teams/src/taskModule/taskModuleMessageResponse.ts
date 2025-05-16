/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponseBase } from './taskModuleResponseBase'

/**
 * Interface representing the message response of a task module.
 */
export interface TaskModuleMessageResponse extends TaskModuleResponseBase {
  /**
   * The value of the task module message response.
   */
  value?: string
}
