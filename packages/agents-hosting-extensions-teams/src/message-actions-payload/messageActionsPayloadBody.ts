/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The type of content.
 */
export type ContentType = 'html' | 'text'

/**
 * Represents the body of the message in the message actions payload.
 */
export interface MessageActionsPayloadBody {
  /**
   * The type of content.
   */
  contentType?: ContentType
  /**
   * The content of the message.
   */
  content?: string
  /**
   * The text content of the message.
   */
  textContent?: string
}
