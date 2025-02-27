/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CacheInfo } from '../bot-config/cacheInfo'
import { MessagingExtensionResult } from './messagingExtensionResult'

export interface MessagingExtensionResponse {
  composeExtension?: MessagingExtensionResult
  cacheInfo?: CacheInfo
}
