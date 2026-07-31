// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Class representing read receipt information.
 */
export class ReadReceiptInfo {
  /**
   * The ID of the last read message.
   */
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
    if (compareMessageId.trim().length === 0 || lastReadMessageId.trim().length === 0) {
      return false
    }

    const compareMessageIdNum = Number(compareMessageId)
    const lastReadMessageIdNum = Number(lastReadMessageId)

    if (!Number.isFinite(compareMessageIdNum) || !Number.isFinite(lastReadMessageIdNum)) {
      return false
    }

    return compareMessageIdNum <= lastReadMessageIdNum
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
