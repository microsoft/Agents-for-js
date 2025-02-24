/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabEntityContext } from '../tab/tabEntityContext'
import { TaskModuleRequestContext } from './taskModuleRequestContext'

export interface TaskModuleRequest {
  data?: any
  context?: TaskModuleRequestContext
  tabContext?: TabEntityContext
}
