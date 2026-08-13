import assert from 'node:assert'
import { describe, it } from 'node:test'
import { ReadReceiptInfo } from '../src/models/readReceiptInfo'

describe('ReadReceiptInfo', () => {
  describe('constructor', () => {
    it('should default lastReadMessageId to an empty string', () => {
      const info = new ReadReceiptInfo()
      assert.strictEqual(info.lastReadMessageId, '')
    })

    it('should set lastReadMessageId from the constructor argument', () => {
      const info = new ReadReceiptInfo('42')
      assert.strictEqual(info.lastReadMessageId, '42')
    })
  })

  describe('static isMessageRead', () => {
    it('should return true when compareMessageId is less than lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', '10'), true)
    })

    it('should return true when compareMessageId equals lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('10', '10'), true)
    })

    it('should return false when compareMessageId is greater than lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('15', '10'), false)
    })

    it('should return false when compareMessageId is empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('', '10'), false)
    })

    it('should return false when lastReadMessageId is empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', ''), false)
    })

    it('should return false when both message IDs are empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('', ''), false)
    })

    it('should return false when compareMessageId contains only whitespace', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('   ', '10'), false)
    })

    it('should return false when lastReadMessageId contains only whitespace', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', '   '), false)
    })

    it('should return false when message IDs are non-numeric strings', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('abc', '10'), false)
    })
  })

  describe('instance isMessageRead', () => {
    it('should use the instance lastReadMessageId', () => {
      const info = new ReadReceiptInfo('20')
      assert.strictEqual(info.isMessageRead('15'), true)
      assert.strictEqual(info.isMessageRead('25'), false)
    })

    it('should return false when the instance lastReadMessageId is empty', () => {
      const info = new ReadReceiptInfo()
      assert.strictEqual(info.isMessageRead('5'), false)
    })
  })
})
