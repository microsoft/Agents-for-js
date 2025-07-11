/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleRequestContext } from './taskModuleRequestContext'

/**
 * Represents the request of a task module.
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
  tabContext?: any // TODO TabEntityContext
}
