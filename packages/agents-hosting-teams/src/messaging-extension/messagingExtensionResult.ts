/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { MessagingExtensionAttachment } from './messagingExtensionAttachment'
import { MessagingExtensionSuggestedAction } from './messagingExtensionSuggestedAction'

/**
 * Layout options for attachments.
 */
export type AttachmentLayout = 'list' | 'grid'

/**
 * Types of messaging extension results.
 */
export type MessagingExtensionResultType =
    | 'result'
    | 'auth'
    | 'config'
    | 'message'
    | 'botMessagePreview'
    | 'silentAuth'

/**
 * Represents the result of a messaging extension.
 */
export interface MessagingExtensionResult {
  /**
   * The layout of the attachments.
   */
  attachmentLayout?: AttachmentLayout
  /**
   * The type of the result.
   */
  type?: MessagingExtensionResultType
  /**
   * A list of attachments.
   */
  attachments?: MessagingExtensionAttachment[]
  /**
   * Suggested actions for the result.
   */
  suggestedActions?: MessagingExtensionSuggestedAction
  /**
   * Text content of the result.
   */
  text?: string
  /**
   * Preview of the activity.
   */
  activityPreview?: Activity
}
