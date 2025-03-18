/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Class representing read receipt information.
 */
export class ReadReceiptInfo {
  lastReadMessageId: string

  /**
   * Creates an instance of ReadReceiptInfo.
   * @param {string} [lastReadMessageId=''] - The ID of the last read message.
   */
  constructor (lastReadMessageId: string = '') {
    this.lastReadMessageId = lastReadMessageId
  }

  /**
   * Checks if a message has been read.
   * @param {string} compareMessageId - The ID of the message to compare.
   * @param {string} lastReadMessageId - The ID of the last read message.
   * @returns {boolean} True if the message has been read, false otherwise.
   */
  static isMessageRead (compareMessageId: string, lastReadMessageId: string): boolean {
    if (
      compareMessageId &&
            compareMessageId.trim().length > 0 &&
            lastReadMessageId &&
            lastReadMessageId.trim().length > 0
    ) {
      const compareMessageIdNum = Number(compareMessageId)
      const lastReadMessageIdNum = Number(lastReadMessageId)

      if (compareMessageIdNum && lastReadMessageIdNum) {
        return compareMessageIdNum <= lastReadMessageIdNum
      }
    }
    return false
  }

  /**
   * Checks if a message has been read using the instance's last read message ID.
   * @param {string} compareMessageId - The ID of the message to compare.
   * @returns {boolean} True if the message has been read, false otherwise.
   */
  isMessageRead (compareMessageId: string): boolean {
    return ReadReceiptInfo.isMessageRead(compareMessageId, this.lastReadMessageId)
  }
}
