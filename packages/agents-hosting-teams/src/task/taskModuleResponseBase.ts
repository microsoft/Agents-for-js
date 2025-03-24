/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type representing the bot message preview type.
 */
export type BotMessagePreviewType = 'message' | 'continue'

/**
 * Interface representing the base response of a task module.
 */
export interface TaskModuleResponseBase {
  /**
   * The type of the bot message preview.
   */
  type?: BotMessagePreviewType
}
