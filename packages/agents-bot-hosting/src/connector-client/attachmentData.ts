/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface AttachmentData {
  type: string
  name: string
  originalBase64: Uint8Array
  thumbnailBase64: Uint8Array
}
