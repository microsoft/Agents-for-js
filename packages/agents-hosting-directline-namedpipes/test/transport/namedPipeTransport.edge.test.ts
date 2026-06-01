// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PassThrough } from 'node:stream'
import { NamedPipeTransport } from '../../src/transport/namedPipeTransport.js'
import { Errors } from '../../src/errorHelper.js'
import type { Socket } from 'node:net'

function createMockSocket (): PassThrough & { destroyed: boolean, writable: boolean } {
  const stream = new PassThrough() as any
  stream.destroyed = false
  stream.writable = true
  return stream
}

function createErrorSocket (): PassThrough & { destroyed: boolean, writable: boolean } {
  const stream = new PassThrough() as any
  stream.destroyed = false
  stream.writable = true
  stream.write = (_data: any, cbOrEncoding?: any, cbMaybe?: any) => {
    const cb = typeof cbOrEncoding === 'function' ? cbOrEncoding : cbMaybe
    if (typeof cb === 'function') {
      cb(new Error('write failed'))
    }
    return false
  }
  return stream
}

describe('NamedPipeTransport edge cases', () => {
  describe('readExact', () => {
    it('reads data delivered in 1-byte chunks', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      const payload = Buffer.from('0123456789')

      const readPromise = transport.readExact(payload.length)
      setTimeout(() => {
        for (const byte of payload) {
          socket.push(Buffer.from([byte]))
        }
      }, 10)

      const result = await readPromise
      assert.deepStrictEqual(result, { success: true, data: payload })
    })

    it('returns failure when the stream closes mid-read', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const readPromise = transport.readExact(100)
      setTimeout(() => {
        socket.push(Buffer.alloc(50, 1))
        socket.destroy()
      }, 10)

      const result = await readPromise
      assert.strictEqual(result.success, false)
      assert.strictEqual(result.data.length, 0)
    })

    it('returns failure when the stream errors mid-read', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const readPromise = transport.readExact(100)
      setTimeout(() => {
        socket.push(Buffer.alloc(30, 2))
        socket.emit('error', new Error('read failed'))
      }, 10)

      const result = await readPromise
      assert.strictEqual(result.success, false)
      assert.strictEqual(result.data.length, 0)
    })

    it('returns failure immediately for a destroyed stream', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      await transport.dispose()

      const result = await transport.readExact(10)
      assert.strictEqual(result.success, false)
      assert.strictEqual(result.data.length, 0)
    })

    it('preserves leftover bytes for the next read', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      const payload = Buffer.from('0123456789abcdefghij')

      const firstReadPromise = transport.readExact(10)
      setTimeout(() => {
        socket.push(payload)
      }, 10)
      const first = await firstReadPromise
      const second = await transport.readExact(10)

      assert.deepStrictEqual(first, { success: true, data: Buffer.from('0123456789') })
      assert.deepStrictEqual(second, { success: true, data: Buffer.from('abcdefghij') })
    })

    it('destroys the stream when an error fires mid-frame so partial bytes cannot leak into the next caller', async () => {
      // If only some bytes of a framed read arrive and the underlying stream
      // errors or closes, those bytes are unrecoverable — but Node may have
      // additional bytes buffered. Without destroying the stream, a follow-up
      // readExact would start mid-frame and the next "header" would be parsed
      // out of payload bytes, silently desynchronizing the protocol.
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const readPromise = transport.readExact(100)
      setTimeout(() => {
        socket.push(Buffer.alloc(20, 7))
        socket.emit('error', new Error('mid-frame error'))
      }, 10)

      const result = await readPromise
      assert.strictEqual(result.success, false)
      assert.strictEqual(socket.destroyed, true, 'stream must be destroyed to prevent partial-frame leakage')
    })

    it('destroys the stream when close fires mid-frame', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const readPromise = transport.readExact(100)
      setTimeout(() => {
        socket.push(Buffer.alloc(40, 9))
        socket.emit('close')
      }, 10)

      const result = await readPromise
      assert.strictEqual(result.success, false)
      assert.strictEqual(socket.destroyed, true, 'stream must be destroyed when close interrupts a partial frame')
    })
    it('returns success immediately when count is 0 (no data event needed)', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      // Must NOT hang waiting for a 'data' event the caller cannot guarantee
      // will ever fire. Reproduces the latent hang when callers compute
      // `missing = expected - received` and the result is exactly 0.
      const result = await transport.readExact(0)
      assert.deepStrictEqual(result, { success: true, data: Buffer.alloc(0) })
    })

    it('returns success immediately when count is negative', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const result = await transport.readExact(-5)
      assert.deepStrictEqual(result, { success: true, data: Buffer.alloc(0) })
    })
  })

  describe('readExactWithTimeout', () => {
    it('completes before the timeout when all bytes arrive', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      const payload = Buffer.from('hello world')

      const readPromise = transport.readExactWithTimeout(payload.length, 500)
      setTimeout(() => {
        socket.push(payload)
      }, 50)

      const result = await readPromise
      assert.deepStrictEqual(result, { success: true, data: payload, partial: false })
    })

    it('returns partial data on timeout', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      const partialPayload = Buffer.from('hello')

      const readPromise = transport.readExactWithTimeout(10, 50)
      setTimeout(() => {
        socket.push(partialPayload)
      }, 10)

      const result = await readPromise
      assert.deepStrictEqual(result, { success: true, data: partialPayload, partial: true })
    })

    it('returns success=false partial=true when no data arrives before timeout', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const result = await transport.readExactWithTimeout(10, 50)
      assert.deepStrictEqual(result, { success: false, data: Buffer.alloc(0), partial: true })
    })

    it('returns failure when the stream closes before timeout', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      const readPromise = transport.readExactWithTimeout(10, 500)
      setTimeout(() => {
        socket.destroy()
      }, 10)

      const result = await readPromise
      assert.deepStrictEqual(result, { success: false, data: Buffer.alloc(0), partial: false })
    })

    it('returns success immediately when count is 0 without waiting for the timeout', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      // With a large timeout, the call must NOT block — a zero-byte read has
      // nothing to wait for and the previous implementation hung for the full
      // timeoutMs before resolving.
      const started = Date.now()
      const result = await transport.readExactWithTimeout(0, 5000)
      const elapsed = Date.now() - started

      assert.deepStrictEqual(result, { success: true, data: Buffer.alloc(0), partial: false })
      assert.ok(elapsed < 50, `must resolve immediately, took ${elapsed}ms`)
    })
  })

  describe('write', () => {
    it('rejects when writing to a destroyed stream', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      await transport.dispose()

      await assert.rejects(
        transport.write(Buffer.from('data')),
        {
          code: Errors.PipeNotConnected.code,
          message: /Named pipe is not connected\./
        }
      )
    })

    it('rejects when the write callback receives an error', async () => {
      const socket = createErrorSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      await assert.rejects(
        transport.write(Buffer.from('data')),
        {
          code: Errors.PipeWriteFailed.code,
          message: /Failed to write to named pipe: write failed/
        }
      )
    })
  })
})
