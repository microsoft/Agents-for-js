/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachmentView } from './attachmentView'

export interface AttachmentInfo {
  name: string
  type: string
  views: AttachmentView[]
}
