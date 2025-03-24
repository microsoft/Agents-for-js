/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponse } from '../task/taskModuleResponse'
import { BotConfigAuth } from './botConfigAuth'
import { CacheInfo } from './cacheInfo'

/**
 * Represents the configuration response configuration which can be either BotConfigAuth or TaskModuleResponse.
 */
export type ConfigResponseConfig = BotConfigAuth | TaskModuleResponse

/**
 * Represents the configuration response.
 */
export interface ConfigResponse {
  /**
   * Optional cache information.
   */
  cacheInfo?: CacheInfo
  /**
   * The configuration response configuration.
   */
  config: ConfigResponseConfig
  /**
   * The type of response, which is 'config'.
   */
  responseType: 'config'
}
