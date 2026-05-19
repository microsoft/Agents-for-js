import assert from 'node:assert'
import { describe, it } from 'node:test'
import { ReadReceiptInfo } from '../src/compat/readReceipInfo'

describe('ReadReceiptInfo', () => {
  describe('constructor', () => {
    it('defaults lastReadMessageId to empty string', () => {
      const info = new ReadReceiptInfo()
      assert.strictEqual(info.lastReadMessageId, '')
    })

    it('sets lastReadMessageId from constructor argument', () => {
      const info = new ReadReceiptInfo('42')
      assert.strictEqual(info.lastReadMessageId, '42')
    })
  })

  describe('static isMessageRead', () => {
    it('returns true when compareMessageId <= lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', '10'), true)
    })

    it('returns true when compareMessageId equals lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('10', '10'), true)
    })

    it('returns false when compareMessageId > lastReadMessageId', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('15', '10'), false)
    })

    it('returns false when compareMessageId is empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('', '10'), false)
    })

    it('returns false when lastReadMessageId is empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', ''), false)
    })

    it('returns false when both are empty', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('', ''), false)
    })

    it('returns false when compareMessageId is whitespace only', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('   ', '10'), false)
    })

    it('returns false when lastReadMessageId is whitespace only', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('5', '   '), false)
    })

    it('returns false for non-numeric strings', () => {
      assert.strictEqual(ReadReceiptInfo.isMessageRead('abc', '10'), false)
    })
  })

  describe('instance isMessageRead', () => {
    it('uses the instance lastReadMessageId', () => {
      const info = new ReadReceiptInfo('20')
      assert.strictEqual(info.isMessageRead('15'), true)
      assert.strictEqual(info.isMessageRead('25'), false)
    })

    it('returns false when instance lastReadMessageId is empty', () => {
      const info = new ReadReceiptInfo()
      assert.strictEqual(info.isMessageRead('5'), false)
    })
  })
})
