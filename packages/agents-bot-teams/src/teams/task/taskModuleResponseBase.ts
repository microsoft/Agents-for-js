/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type BotMessagePreviewType = 'message' | 'continue'

export interface TaskModuleResponseBase {
  type?: BotMessagePreviewType
}
