// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { serializeHeader, deserializeHeader, HEADER_SIZE, HeaderTypes, type Header } from '../../src/transport/header.js'

describe('Header', () => {
  describe('serializeHeader', () => {
    it('should produce a buffer of HEADER_SIZE bytes', () => {
      const header: Header = {
        type: HeaderTypes.Request,
        payloadLength: 256,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }
      const buf = serializeHeader(header)
      assert.strictEqual(buf.length, HEADER_SIZE)
    })

    it('should serialize in ASCII text format', () => {
      const header: Header = {
        type: 'A',
        payloadLength: 1024,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }
      const buf = serializeHeader(header)
      const text = buf.toString('ascii')
      // Format: {Type}.{Length:6}.{Id:36}.{End}\n
      assert.strictEqual(text, 'A.001024.12345678-1234-1234-1234-123456789abc.1\n')
    })

    it('should zero-pad length to 6 digits', () => {
      const header: Header = { type: 'B', payloadLength: 42, id: '00000000-0000-0000-0000-000000000000', end: false }
      const buf = serializeHeader(header)
      const text = buf.toString('ascii')
      assert.ok(text.includes('.000042.'))
    })

    it('should serialize end flag as ASCII 1 or 0', () => {
      const headerTrue: Header = { type: 'A', payloadLength: 0, id: '00000000-0000-0000-0000-000000000000', end: true }
      const headerFalse: Header = { type: 'A', payloadLength: 0, id: '00000000-0000-0000-0000-000000000000', end: false }
      assert.ok(serializeHeader(headerTrue).toString('ascii').includes('.1\n'))
      assert.ok(serializeHeader(headerFalse).toString('ascii').includes('.0\n'))
    })
  })

  describe('deserializeHeader', () => {
    it('should round-trip a header correctly', () => {
      const original: Header = {
        type: 'A',
        payloadLength: 4096,
        id: 'abcdef01-2345-6789-abcd-ef0123456789',
        end: true
      }
      const buf = serializeHeader(original)
      const result = deserializeHeader(buf)
      assert.strictEqual(result.type, original.type)
      assert.strictEqual(result.payloadLength, original.payloadLength)
      assert.strictEqual(result.id, original.id)
      assert.strictEqual(result.end, original.end)
    })

    it('should throw if buffer is too small', () => {
      assert.throws(() => {
        deserializeHeader(Buffer.alloc(10))
      }, /buffer too small/)
    })

    it('should handle end=false correctly', () => {
      const original: Header = { type: 'S', payloadLength: 100, id: '11111111-2222-3333-4444-555555555555', end: false }
      const buf = serializeHeader(original)
      const result = deserializeHeader(buf)
      assert.strictEqual(result.end, false)
    })

    it('should parse length of 999999 (max)', () => {
      const original: Header = { type: 'A', payloadLength: 999999, id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', end: true }
      const buf = serializeHeader(original)
      const result = deserializeHeader(buf)
      assert.strictEqual(result.payloadLength, 999999)
    })
  })

  describe('edge cases', () => {
    const createHeader = (overrides: Partial<Header> = {}): Header => ({
      type: 'A',
      payloadLength: 42,
      id: '12345678-1234-1234-1234-123456789abc',
      end: true,
      ...overrides
    })

    const createSerializedHeader = (overrides: Partial<Header> = {}): Buffer => serializeHeader(createHeader(overrides))

    describe('serializeHeader', () => {
      it('should serialize payloadLength = 0 as 000000', () => {
        const text = serializeHeader(createHeader({ payloadLength: 0 })).toString('ascii')
        assert.strictEqual(text.slice(2, 8), '000000')
      })

      it('should serialize payloadLength = 999999 as 999999', () => {
        const text = serializeHeader(createHeader({ payloadLength: 999999 })).toString('ascii')
        assert.strictEqual(text.slice(2, 8), '999999')
      })

      it('should throw for payloadLength = -1', () => {
        assert.throws(() => serializeHeader(createHeader({ payloadLength: -1 })))
      })

      it('should throw for payloadLength = 1000000', () => {
        assert.throws(() => serializeHeader(createHeader({ payloadLength: 1000000 })))
      })

      it('should throw for payloadLength = 1.5', () => {
        assert.throws(() => serializeHeader(createHeader({ payloadLength: 1.5 })))
      })

      it('should throw for invalid type Z', () => {
        assert.throws(() => serializeHeader(createHeader({ type: 'Z' })))
      })

      it('should throw for empty id', () => {
        assert.throws(() => serializeHeader(createHeader({ id: '' })))
      })

      it('should pad short ids with spaces to 36 chars', () => {
        const text = serializeHeader(createHeader({ id: 'short-id' })).toString('ascii')
        assert.strictEqual(text.slice(9, 45), 'short-id'.padEnd(36, ' '))
      })
    })

    describe('deserializeHeader', () => {
      it('should throw if buffer is too small (< 48 bytes)', () => {
        assert.throws(() => deserializeHeader(Buffer.alloc(HEADER_SIZE - 1)))
      })

      it('should throw for wrong delimiter at position 1', () => {
        const buf = createSerializedHeader()
        buf.write('X', 1, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for wrong delimiter at position 8', () => {
        const buf = createSerializedHeader()
        buf.write('X', 8, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for wrong delimiter at position 45', () => {
        const buf = createSerializedHeader()
        buf.write('X', 45, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for missing newline at position 47', () => {
        const buf = createSerializedHeader()
        buf.write('X', 47, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for non-digit characters in the length field', () => {
        const buf = createSerializedHeader()
        buf.write('00ab12', 2, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for an invalid type character', () => {
        const buf = createSerializedHeader()
        buf.write('Z', 0, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for an invalid end flag', () => {
        const buf = createSerializedHeader()
        buf.write('2', 46, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should throw for an empty id field', () => {
        const buf = createSerializedHeader()
        buf.write(' '.repeat(36), 9, 'ascii')
        assert.throws(() => deserializeHeader(buf))
      })

      it('should deserialize payloadLength = 000000 as 0', () => {
        const result = deserializeHeader(createSerializedHeader({ payloadLength: 0 }))
        assert.strictEqual(result.payloadLength, 0)
      })
    })
  })
})
