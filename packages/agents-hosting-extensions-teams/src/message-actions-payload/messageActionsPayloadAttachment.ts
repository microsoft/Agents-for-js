/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents an attachment in the message actions payload.
 */
export interface MessageActionsPayloadAttachment {
  /**
   * The unique identifier of the attachment.
   */
  id?: string
  /**
   * The content type of the attachment.
   */
  contentType?: string
  /**
   * The URL of the attachment content.
   */
  contentUrl?: string
  /**
   * The content of the attachment.
   */
  content?: any
  /**
   * The name of the attachment.
   */
  name?: string
  /**
   * The URL of the attachment thumbnail.
   */
  thumbnailUrl?: string
}
