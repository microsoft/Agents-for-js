/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'
import { TaskModuleRequest } from '../task/taskModuleRequest'
import { MessageActionsPayload } from '../message-actions-payload/messageActionsPayload'

/**
 * Contexts for messaging extension commands.
 */
export type CommandContext = 'message' | 'compose' | 'commandbox'

/**
 * Types of actions for message previews.
 */
export type MessagePreviewActionType = 'edit' | 'send'

/**
 * Represents an action for a messaging extension.
 */
export interface MessagingExtensionAction extends TaskModuleRequest {
  /**
   * The ID of the command.
   */
  commandId?: string
  /**
   * The context of the command.
   */
  commandContext?: CommandContext
  /**
   * The type of action for the agent message preview.
   */
  messagePreviewAction?: MessagePreviewActionType
  /**
   * A list of activities for the agent activity preview.
   */
  activityPreview?: Activity[]
  /**
   * The payload of the message actions.
   */
  messagePayload?: MessageActionsPayload
}
