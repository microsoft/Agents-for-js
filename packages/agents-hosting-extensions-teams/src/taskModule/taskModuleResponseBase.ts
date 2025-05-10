/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Type representing the message preview type.
 */
export type MessagePreviewType = 'message' | 'continue'

/**
 * Interface representing the base response of a task module.
 */
export interface TaskModuleResponseBase {
  /**
   * The type of the message preview.
   */
  type?: MessagePreviewType
}
