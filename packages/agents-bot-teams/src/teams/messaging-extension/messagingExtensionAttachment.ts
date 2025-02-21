/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '@microsoft/agents-bot-hosting'

export interface MessagingExtensionAttachment extends Attachment {
  preview?: Attachment
}
