/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-activity'

/**
 * Interface representing the task module task information.
 */
export interface TaskModuleTaskInfo {
  /**
   * The title of the task module.
   */
  title?: string
  /**
   * The height of the task module.
   */
  height?: number | 'small' | 'medium' | 'large'
  /**
   * The width of the task module.
   */
  width?: number | 'small' | 'medium' | 'large'
  /**
   * The URL of the task module.
   */
  url?: string
  /**
   * The card attachment of the task module.
   */
  card?: Attachment
  /**
   * The fallback URL of the task module.
   */
  fallbackUrl?: string
  /**
   * The completion agent ID of the task module.
   */
  completionAgentId?: string
}
