/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity-schema'
import { TaskModuleRequest } from '../task/taskModuleRequest'
import { MessageActionsPayload } from '../message-actions-payload/messageActionsPayload'

export type CommandContext = 'message' | 'compose' | 'commandbox'
export type BotMessagePreviewActionType = 'edit' | 'send'

export interface MessagingExtensionAction extends TaskModuleRequest {
  commandId?: string
  commandContext?: CommandContext
  botMessagePreviewAction?: BotMessagePreviewActionType
  botActivityPreview?: Activity[]
  messagePayload?: MessageActionsPayload
}
