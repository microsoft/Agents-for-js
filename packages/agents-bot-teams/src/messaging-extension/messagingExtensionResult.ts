/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-bot-hosting'
import { MessagingExtensionAttachment } from './messagingExtensionAttachment'
import { MessagingExtensionSuggestedAction } from './messagingExtensionSuggestedAction'

export type AttachmentLayout = 'list' | 'grid'
export type MessagingExtensionResultType =
    | 'result'
    | 'auth'
    | 'config'
    | 'message'
    | 'botMessagePreview'
    | 'silentAuth'

export interface MessagingExtensionResult {
  attachmentLayout?: AttachmentLayout
  type?: MessagingExtensionResultType
  attachments?: MessagingExtensionAttachment[]
  suggestedActions?: MessagingExtensionSuggestedAction
  text?: string
  activityPreview?: Activity
}
