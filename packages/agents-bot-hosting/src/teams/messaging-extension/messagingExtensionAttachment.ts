/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-bot-activity'

export interface MessagingExtensionAttachment extends Attachment {
  preview?: Attachment
}
