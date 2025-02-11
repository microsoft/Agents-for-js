/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { Attachment } from '../../../../agents-bot-activity'

export interface MessagingExtensionAttachment extends Attachment {
  preview?: Attachment
}
