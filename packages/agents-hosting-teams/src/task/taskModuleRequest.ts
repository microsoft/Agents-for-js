/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabEntityContext } from '../tab/tabEntityContext'
import { TaskModuleRequestContext } from './taskModuleRequestContext'

/**
 * Interface representing the request of a task module.
 */
export interface TaskModuleRequest {
  /**
   * The data of the task module request.
   */
  data?: any
  /**
   * The context of the task module request.
   */
  context?: TaskModuleRequestContext
  /**
   * The tab context of the task module request.
   */
  tabContext?: TabEntityContext
}
