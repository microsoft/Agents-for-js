/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CacheInfo } from '../bot-config/cacheInfo'
import { TaskModuleContinueResponse } from './taskModuleContinueResponse'
import { TaskModuleMessageResponse } from './taskModuleMessageResponse'

export interface TaskModuleResponse {
  task?: TaskModuleContinueResponse | TaskModuleMessageResponse
  cacheInfo?: CacheInfo
}
