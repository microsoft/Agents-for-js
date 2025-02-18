/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export class ReadReceiptInfo {
  lastReadMessageId: string

  constructor (lastReadMessageId: string = '') {
    this.lastReadMessageId = lastReadMessageId
  }

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

  isMessageRead (compareMessageId: string): boolean {
    return ReadReceiptInfo.isMessageRead(compareMessageId, this.lastReadMessageId)
  }
}
