/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { AttachmentView } from './AttachmentView'

export interface AttachmentInfo {
  name: string
  type: string
  views: AttachmentView[]
}
