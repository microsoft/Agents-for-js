// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PassThrough } from 'node:stream'
import { NamedPipeProtocol } from '../../src/protocol/namedPipeProtocol.js'
import { NamedPipeTransport } from '../../src/transport/namedPipeTransport.js'
import { serializeHeader, type Header } from '../../src/transport/header.js'
import { PayloadTypes } from '../../src/protocol/payloadModels.js'
import type { Socket } from 'node:net'
import type { NamedPipeRequest } from '../../src/protocol/namedPipeRequest.js'

function createTransportPair () {
  const readerStream = new PassThrough() as any
  readerStream.destroyed = false
  readerStream.writable = true

  const writerStream = new PassThrough() as any
  writerStream.destroyed = false
  writerStream.writable = true

  const reader = new NamedPipeTransport(readerStream as unknown as Socket)
  const writer = new NamedPipeTransport(writerStream as unknown as Socket)

  return { reader, writer, readerStream, writerStream }
}

describe('NamedPipeProtocol', () => {
  describe('request handling (no body)', () => {
    it('should dispatch received requests without streams', async () => {
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)

      const receivedRequests: NamedPipeRequest[] = []
      protocol.onRequestReceived = async (request) => {
        receivedRequests.push(request)
        return { statusCode: 200, body: null }
      }

      protocol.start()

      // Simulate an incoming request frame (no body/streams)
      const payload = Buffer.from(JSON.stringify({ verb: 'POST', path: '/api/messages', streams: null }), 'utf8')
      const header: Header = {
        type: PayloadTypes.Request,
        payloadLength: payload.length,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }

      readerStream.push(serializeHeader(header))
      readerStream.push(payload)

      await new Promise(resolve => setTimeout(resolve, 50))

      assert.strictEqual(receivedRequests.length, 1)
      assert.strictEqual(receivedRequests[0].verb, 'POST')
      assert.strictEqual(receivedRequests[0].path, '/api/messages')
      assert.strictEqual(receivedRequests[0].body, null)

      await protocol.dispose()
    })
  })

  describe('request handling (with stream body)', () => {
    it('should wait for stream frame before dispatching request', async () => {
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)

      const receivedRequests: NamedPipeRequest[] = []
      protocol.onRequestReceived = async (request) => {
        receivedRequests.push(request)
        return { statusCode: 200, body: null }
      }

      protocol.start()

      const streamId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const bodyData = Buffer.from('{"text":"hello"}', 'utf8')

      // Send request frame referencing a stream
      const requestPayload = Buffer.from(JSON.stringify({
        verb: 'POST',
        path: '/api/messages',
        streams: [{ id: streamId, type: 'application/json', length: bodyData.length }]
      }), 'utf8')

      const requestHeader: Header = {
        type: PayloadTypes.Request,
        payloadLength: requestPayload.length,
        id: '12345678-1234-1234-1234-123456789abc',
        end: false
      }
      readerStream.push(serializeHeader(requestHeader))
      readerStream.push(requestPayload)

      // Request not dispatched yet (stream not complete)
      await new Promise(resolve => setTimeout(resolve, 30))
      assert.strictEqual(receivedRequests.length, 0)

      // Now send the stream frame
      const streamHeader: Header = {
        type: PayloadTypes.Stream,
        payloadLength: bodyData.length,
        id: streamId,
        end: true
      }
      readerStream.push(serializeHeader(streamHeader))
      readerStream.push(bodyData)

      await new Promise(resolve => setTimeout(resolve, 50))

      assert.strictEqual(receivedRequests.length, 1)
      assert.strictEqual(receivedRequests[0].verb, 'POST')
      assert.deepStrictEqual(receivedRequests[0].body, bodyData)

      await protocol.dispose()
    })
  })

  describe('sendRequest', () => {
    it('should write request and stream frames, resolve on response', async () => {
      const { reader, writer, readerStream, writerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)
      protocol.start()

      // Capture written frames
      const written: Buffer[] = []
      writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

      const body = Buffer.from('{"activity":"test"}', 'utf8')
      const responsePromise = protocol.sendRequest('POST', '/api/messages', body)

      // Wait for request + stream frames to be written
      await new Promise(resolve => setTimeout(resolve, 50))

      // Parse written output to find request ID
      assert.ok(written.length >= 2) // at least request header+payload and stream header+payload
      const firstHeader = written[0].toString('ascii')
      const requestId = firstHeader.slice(9, 45)

      // Send a simple response (no body)
      const responsePayload = Buffer.from(JSON.stringify({ statusCode: 200, streams: null }), 'utf8')
      const responseHeader: Header = {
        type: PayloadTypes.Response,
        payloadLength: responsePayload.length,
        id: requestId,
        end: true
      }

      readerStream.push(serializeHeader(responseHeader))
      readerStream.push(responsePayload)

      const response = await responsePromise
      assert.strictEqual(response.statusCode, 200)
      assert.strictEqual(response.body, null)

      await protocol.dispose()
    })
  })

  describe('dispose', () => {
    it('should reject pending requests on dispose', async () => {
      const { reader, writer } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)
      protocol.start()

      const promise = protocol.sendRequest('GET', '/test', null)

      await protocol.dispose()

      await assert.rejects(async () => {
        await promise
      })
    })
  })

  describe('multi-stream attachments', () => {
    it('should wait for all streams before dispatching request with attachments', async () => {
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)

      const receivedRequests: NamedPipeRequest[] = []
      protocol.onRequestReceived = async (request) => {
        receivedRequests.push(request)
        return { statusCode: 200, body: null }
      }

      protocol.start()

      const bodyStreamId = 'aaaaaaaa-0000-0000-0000-000000000001'
      const attachmentStreamId = 'aaaaaaaa-0000-0000-0000-000000000002'
      const bodyData = Buffer.from('{"text":"hello"}', 'utf8')
      const attachmentData = Buffer.from('image-bytes-here', 'utf8')

      const requestPayload = Buffer.from(JSON.stringify({
        verb: 'POST',
        path: '/api/messages',
        streams: [
          { id: bodyStreamId, type: 'application/json', length: bodyData.length },
          { id: attachmentStreamId, type: 'image/png', length: attachmentData.length }
        ]
      }), 'utf8')

      readerStream.push(serializeHeader({
        type: PayloadTypes.Request,
        payloadLength: requestPayload.length,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }))
      readerStream.push(requestPayload)

      readerStream.push(serializeHeader({
        type: PayloadTypes.Stream,
        payloadLength: bodyData.length,
        id: bodyStreamId,
        end: true
      }))
      readerStream.push(bodyData)

      await new Promise(resolve => setTimeout(resolve, 30))
      assert.strictEqual(receivedRequests.length, 0)

      readerStream.push(serializeHeader({
        type: PayloadTypes.Stream,
        payloadLength: attachmentData.length,
        id: attachmentStreamId,
        end: true
      }))
      readerStream.push(attachmentData)

      await new Promise(resolve => setTimeout(resolve, 50))

      assert.strictEqual(receivedRequests.length, 1)
      assert.deepStrictEqual(receivedRequests[0].body, bodyData)
      assert.strictEqual(receivedRequests[0].contentType, 'application/json')
      assert.strictEqual(receivedRequests[0].attachments.length, 1)
      assert.strictEqual(receivedRequests[0].attachments[0].contentType, 'image/png')
      assert.deepStrictEqual(receivedRequests[0].attachments[0].body, attachmentData)

      await protocol.dispose()
    })

    it('should send request with attachments', async () => {
      const { reader, writer, readerStream, writerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)
      protocol.start()

      const written: Buffer[] = []
      writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

      const body = Buffer.from('{"activity":"test"}', 'utf8')
      const attachment = { id: '11111111-2222-3333-4444-555555555555', contentType: 'image/png', body: Buffer.from('png-data') }
      const responsePromise = protocol.sendRequest('POST', '/api/messages', body, [attachment])

      await new Promise(resolve => setTimeout(resolve, 50))

      const firstHeader = written[0].toString('ascii')
      const requestId = firstHeader.slice(9, 45)

      const requestPayloadStr = written[1].toString('utf8')
      const requestPayloadObj = JSON.parse(requestPayloadStr)
      assert.strictEqual(requestPayloadObj.streams.length, 2)
      assert.strictEqual(requestPayloadObj.streams[0].type, 'application/json')
      assert.strictEqual(requestPayloadObj.streams[1].type, 'image/png')

      const responsePayload = Buffer.from(JSON.stringify({ statusCode: 200, streams: null }), 'utf8')
      readerStream.push(serializeHeader({
        type: PayloadTypes.Response,
        payloadLength: responsePayload.length,
        id: requestId,
        end: true
      }))
      readerStream.push(responsePayload)

      const response = await responsePromise
      assert.strictEqual(response.statusCode, 200)

      await protocol.dispose()
    })
  })

  describe('CancelAll handling', () => {
    it('should reject pending outbound requests on CancelAll', async () => {
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)
      protocol.start()

      const promise = protocol.sendRequest('POST', '/api/messages', null)

      await new Promise(resolve => setTimeout(resolve, 20))
      readerStream.push(serializeHeader({
        type: PayloadTypes.CancelAll,
        payloadLength: 0,
        id: '00000000-0000-0000-0000-000000000000',
        end: true
      }))

      await assert.rejects(async () => { await promise }, /CancelAll/)

      await protocol.dispose()
    })

    it('should abort in-flight dispatch on CancelAll', async () => {
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)

      let abortSignalAborted = false
      protocol.onRequestReceived = async (_request, signal) => {
        await new Promise<void>((resolve) => {
          if (signal?.aborted) { abortSignalAborted = true; resolve(); return }
          signal?.addEventListener('abort', () => { abortSignalAborted = true; resolve() })
          setTimeout(resolve, 2000)
        })
        return { statusCode: 200, body: null }
      }

      protocol.start()

      const payload = Buffer.from(JSON.stringify({ verb: 'POST', path: '/api/messages', streams: null }), 'utf8')
      readerStream.push(serializeHeader({
        type: PayloadTypes.Request,
        payloadLength: payload.length,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }))
      readerStream.push(payload)

      await new Promise(resolve => setTimeout(resolve, 30))

      readerStream.push(serializeHeader({
        type: PayloadTypes.CancelAll,
        payloadLength: 0,
        id: '00000000-0000-0000-0000-000000000000',
        end: true
      }))

      await new Promise(resolve => setTimeout(resolve, 50))
      assert.strictEqual(abortSignalAborted, true)

      await protocol.dispose()
    })
  })

  describe('CancelStream handling', () => {
    it('should silently drop pending request when primary stream is cancelled', async () => {
      // Following Bot.Streaming semantics: incoming CancelStream is silently dropped.
      // The pending request is never dispatched to the handler.
      const { reader, writer, readerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)

      const receivedRequests: NamedPipeRequest[] = []
      protocol.onRequestReceived = async (request) => {
        receivedRequests.push(request)
        return { statusCode: 200, body: null }
      }

      protocol.start()

      const streamId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
      const requestPayload = Buffer.from(JSON.stringify({
        verb: 'POST',
        path: '/api/messages',
        streams: [{ id: streamId, type: 'application/json', length: 100 }]
      }), 'utf8')

      readerStream.push(serializeHeader({
        type: PayloadTypes.Request,
        payloadLength: requestPayload.length,
        id: '12345678-1234-1234-1234-123456789abc',
        end: true
      }))
      readerStream.push(requestPayload)

      await new Promise(resolve => setTimeout(resolve, 30))
      assert.strictEqual(receivedRequests.length, 0)

      readerStream.push(serializeHeader({
        type: PayloadTypes.CancelStream,
        payloadLength: 0,
        id: streamId,
        end: true
      }))

      await new Promise(resolve => setTimeout(resolve, 50))
      // Handler should NOT be called — request is silently abandoned
      assert.strictEqual(receivedRequests.length, 0)

      await protocol.dispose()
    })
  })

  describe('write failure reconnect', () => {
    it('should resolve completion on write failure', async () => {
      const { reader, writer, writerStream } = createTransportPair()
      const protocol = new NamedPipeProtocol(reader, writer)
      protocol.start()

      writerStream.destroy()

      // sendRequest will fail (write to destroyed stream) and mark protocol as failed
      const sendPromise = protocol.sendRequest('POST', '/test', Buffer.from('test'))
      // Catch the rejection to prevent unhandled rejection
      sendPromise.catch(() => { })

      // Completion should resolve (allow server to reconnect)
      await Promise.race([
        protocol.completion,
        new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
      ])

      // Now dispose, which also rejects any remaining pending requests
      await protocol.dispose()

      // Verify the send did fail
      await assert.rejects(async () => { await sendPromise })
    })
  })
})
