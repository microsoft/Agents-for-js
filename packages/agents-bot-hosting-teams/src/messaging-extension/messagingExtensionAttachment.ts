/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-bot-hosting'

/**
 * Represents an attachment for a messaging extension.
 */
export interface MessagingExtensionAttachment extends Attachment {
  /**
   * A preview of the attachment.
   */
  preview?: Attachment
}
