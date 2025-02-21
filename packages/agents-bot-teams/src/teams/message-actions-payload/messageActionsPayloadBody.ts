/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

export type ContentType = 'html' | 'text'

export interface MessageActionsPayloadBody {
  contentType?: ContentType
  content?: string
  textContent?: string
}
