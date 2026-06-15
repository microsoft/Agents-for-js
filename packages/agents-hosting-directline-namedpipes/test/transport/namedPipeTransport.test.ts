// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PassThrough } from 'node:stream'
import { NamedPipeTransport } from '../../src/transport/namedPipeTransport.js'
import type { Socket } from 'node:net'

function createMockSocket (): PassThrough & { destroyed: boolean, writable: boolean } {
  const stream = new PassThrough() as any
  stream.destroyed = false
  stream.writable = true
  return stream
}

describe('NamedPipeTransport', () => {
  describe('isConnected', () => {
    it('should return true when socket is alive', () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      assert.strictEqual(transport.isConnected, true)
    })

    it('should return false after dispose', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      await transport.dispose()
      assert.strictEqual(transport.isConnected, false)
    })
  })

  describe('readExact', () => {
    it('should read exact number of bytes', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      // Write data after a small delay
      setTimeout(() => {
        socket.push(Buffer.from('hello world'))
      }, 10)

      const result = await transport.readExact(5)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.toString(), 'hello')
    })

    it('should handle chunked reads', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      setTimeout(() => {
        socket.push(Buffer.from('hel'))
        setTimeout(() => socket.push(Buffer.from('lo')), 5)
      }, 10)

      const result = await transport.readExact(5)
      assert.strictEqual(result.success, true)
      assert.strictEqual(result.data.toString(), 'hello')
    })

    it('should return failure on close', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)

      setTimeout(() => {
        socket.destroy()
      }, 10)

      const result = await transport.readExact(10)
      assert.strictEqual(result.success, false)
    })
  })

  describe('write', () => {
    it('should write buffer to socket', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      const data = Buffer.from('test data')

      const chunks: Buffer[] = []
      socket.on('data', (chunk: Buffer) => chunks.push(chunk))

      await transport.write(data)
      assert.strictEqual(Buffer.concat(chunks).toString(), 'test data')
    })

    it('should throw when not connected', async () => {
      const socket = createMockSocket()
      const transport = new NamedPipeTransport(socket as unknown as Socket)
      await transport.dispose()

      await assert.rejects(async () => {
        await transport.write(Buffer.from('data'))
      })
    })
  })
})
