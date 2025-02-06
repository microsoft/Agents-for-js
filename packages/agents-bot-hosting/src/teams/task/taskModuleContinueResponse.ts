/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponseBase } from './taskModuleResponseBase'
import { TaskModuleTaskInfo } from './taskModuleTaskInfo'

export interface TaskModuleContinueResponse extends TaskModuleResponseBase {
  value?: TaskModuleTaskInfo
}
