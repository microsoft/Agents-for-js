/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponse } from '../task/taskModuleResponse'
import { BotConfigAuth } from './botConfigAuth'
import { CacheInfo } from './cacheInfo'

export type ConfigResponseConfig = BotConfigAuth | TaskModuleResponse

export interface ConfigResponse {
  cacheInfo?: CacheInfo
  config: ConfigResponseConfig
  responseType: 'config'
}
