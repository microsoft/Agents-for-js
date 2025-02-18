/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessagingExtensionResult } from './messagingExtensionResult'
import { TaskModuleContinueResponse } from '../task/taskModuleContinueResponse'
import { TaskModuleMessageResponse } from '../task/taskModuleMessageResponse'
import { CacheInfo } from '../bot-config/cacheInfo'

export interface MessagingExtensionActionResponse {
  task?: TaskModuleContinueResponse | TaskModuleMessageResponse
  composeExtension?: MessagingExtensionResult
  cacheInfo?: CacheInfo
}
