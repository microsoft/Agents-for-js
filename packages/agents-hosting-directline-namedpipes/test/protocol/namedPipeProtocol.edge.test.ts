// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { PassThrough } from 'node:stream'
import { NamedPipeProtocol } from '../../src/protocol/namedPipeProtocol.js'
import { NamedPipeTransport } from '../../src/transport/namedPipeTransport.js'
import { deserializeHeader, serializeHeader, type Header } from '../../src/transport/header.js'
import { MAX_INFLIGHT_DISPATCHES, MAX_STREAM_BUFFERS, PayloadTypes } from '../../src/protocol/payloadModels.js'
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

function delay (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitFor<T> (getValue: () => T | undefined, timeoutMs = 1000, intervalMs = 10): Promise<T> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const value = getValue()
    if (value !== undefined) {
      return value
    }
    await delay(intervalMs)
  }

  assert.fail(`Timed out after ${timeoutMs}ms`)
}

function parseFirstFrame (buffer: Buffer): { header: Header, payload: Buffer } {
  const header = deserializeHeader(buffer.subarray(0, 48))
  const payloadStart = 48
  const payloadEnd = payloadStart + header.payloadLength
  return {
    header,
    payload: buffer.subarray(payloadStart, payloadEnd)
  }
}

async function waitForFrame (chunks: Buffer[], timeoutMs = 1000): Promise<{ header: Header, payload: Buffer }> {
  return await waitFor(() => {
    const combined = Buffer.concat(chunks)
    if (combined.length < 48) return undefined
    const header = deserializeHeader(combined.subarray(0, 48))
    const totalLength = 48 + header.payloadLength
    if (combined.length < totalLength) return undefined
    return parseFirstFrame(combined)
  }, timeoutMs)
}

describe('NamedPipeProtocol edge cases', () => {
  it('assembles a multi-chunk inbound stream across three frames', async () => {
    const { reader, writer, readerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)

    const receivedRequests: NamedPipeRequest[] = []
    protocol.onRequestReceived = async (request) => {
      receivedRequests.push(request)
      return { statusCode: 200, body: null }
    }

    protocol.start()

    const streamId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    const chunks = [
      Buffer.from('0123456789', 'utf8'),
      Buffer.from('abcdefghij', 'utf8'),
      Buffer.from('KLMNOPQRST', 'utf8')
    ]
    const expectedBody = Buffer.concat(chunks)

    const requestPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/multi-chunk',
      streams: [{ id: streamId, type: 'application/json', length: 30 }]
    }), 'utf8')

    readerStream.push(serializeHeader({
      type: PayloadTypes.Request,
      payloadLength: requestPayload.length,
      id: '12345678-1234-1234-1234-123456789abc',
      end: true
    }))
    readerStream.push(requestPayload)

    for (let i = 0; i < chunks.length; i++) {
      readerStream.push(serializeHeader({
        type: PayloadTypes.Stream,
        payloadLength: chunks[i].length,
        id: streamId,
        end: i === chunks.length - 1
      }))
      readerStream.push(chunks[i])
    }

    await waitFor(() => receivedRequests.length === 1 ? receivedRequests[0] : undefined)
    assert.deepStrictEqual(receivedRequests[0].body, expectedBody)

    await protocol.dispose()
  })

  it('dispatches concurrent inbound requests with interleaved streams', async () => {
    const { reader, writer, readerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)

    const receivedByPath = new Map<string, NamedPipeRequest>()
    protocol.onRequestReceived = async (request) => {
      receivedByPath.set(request.path, request)
      return { statusCode: 200, body: null }
    }

    protocol.start()

    const requestAId = 'aaaaaaaa-1111-1111-1111-111111111111'
    const requestBId = 'bbbbbbbb-2222-2222-2222-222222222222'
    const streamAId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const streamBId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const bodyA = Buffer.from('request-a-body', 'utf8')
    const bodyB = Buffer.from('request-b-body', 'utf8')

    const requestAPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/request-a',
      streams: [{ id: streamAId, type: 'application/json', length: bodyA.length }]
    }), 'utf8')
    const requestBPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/request-b',
      streams: [{ id: streamBId, type: 'application/json', length: bodyB.length }]
    }), 'utf8')

    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: requestAPayload.length, id: requestAId, end: true }))
    readerStream.push(requestAPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: requestBPayload.length, id: requestBId, end: true }))
    readerStream.push(requestBPayload)

    const aChunk1 = bodyA.subarray(0, 5)
    const aChunk2 = bodyA.subarray(5)
    const bChunk1 = bodyB.subarray(0, 5)
    const bChunk2 = bodyB.subarray(5)

    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: aChunk1.length, id: streamAId, end: false }))
    readerStream.push(aChunk1)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: bChunk1.length, id: streamBId, end: false }))
    readerStream.push(bChunk1)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: aChunk2.length, id: streamAId, end: true }))
    readerStream.push(aChunk2)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: bChunk2.length, id: streamBId, end: true }))
    readerStream.push(bChunk2)

    await waitFor(() => receivedByPath.size === 2 ? receivedByPath : undefined)
    assert.deepStrictEqual(receivedByPath.get('/request-a')?.body, bodyA)
    assert.deepStrictEqual(receivedByPath.get('/request-b')?.body, bodyB)

    await protocol.dispose()
  })

  it('sends a 500 response when the request handler fails', async () => {
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)

    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    protocol.onRequestReceived = async () => { throw new Error('boom') }
    protocol.start()

    const payload = Buffer.from(JSON.stringify({ verb: 'POST', path: '/throws', streams: null }), 'utf8')
    readerStream.push(serializeHeader({
      type: PayloadTypes.Request,
      payloadLength: payload.length,
      id: 'cccccccc-3333-3333-3333-333333333333',
      end: true
    }))
    readerStream.push(payload)

    const parsed = await waitForFrame(written)
    const responsePayload = JSON.parse(parsed.payload.toString('utf8'))

    assert.strictEqual(parsed.header.type, PayloadTypes.Response)
    assert.strictEqual(parsed.header.id, 'cccccccc-3333-3333-3333-333333333333')
    assert.strictEqual(responsePayload.statusCode, 500)

    await protocol.dispose()
  })

  it('drops inbound requests silently when no handler is registered', async () => {
    const { reader, writer, readerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)

    protocol.start()

    const payload = Buffer.from(JSON.stringify({ verb: 'POST', path: '/no-handler', streams: null }), 'utf8')
    readerStream.push(serializeHeader({
      type: PayloadTypes.Request,
      payloadLength: payload.length,
      id: 'dddddddd-4444-4444-4444-444444444444',
      end: true
    }))
    readerStream.push(payload)

    await delay(100)
    await protocol.dispose()
  })

  it('disconnects when MAX_STREAM_BUFFERS is exceeded', async () => {
    const { reader, writer, readerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    protocol.start()

    for (let i = 0; i < MAX_STREAM_BUFFERS + 1; i++) {
      const id = `00000000-0000-0000-0000-${i.toString().padStart(12, '0')}`
      const payload = Buffer.from([i % 256])
      readerStream.push(serializeHeader({
        type: PayloadTypes.Stream,
        payloadLength: payload.length,
        id,
        end: false
      }))
      readerStream.push(payload)
    }

    await Promise.race([
      protocol.completion,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
    ])
  })

  it('assembles a streamed response body for a pending outbound request', async () => {
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    protocol.start()

    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    const responsePromise = protocol.sendRequest('POST', '/streamed-response', Buffer.from('request-body', 'utf8'))

    const requestId = await waitFor(() => {
      const combined = Buffer.concat(written)
      return combined.length >= 48 ? combined.subarray(9, 45).toString('ascii').trim() : undefined
    })

    const responseBody = Buffer.from('{"ok":true}', 'utf8')
    const responseStreamId = 'eeeeeeee-5555-5555-5555-555555555555'
    const responsePayload = Buffer.from(JSON.stringify({
      statusCode: 200,
      streams: [{ id: responseStreamId, type: 'application/json', length: responseBody.length }]
    }), 'utf8')

    readerStream.push(serializeHeader({
      type: PayloadTypes.Response,
      payloadLength: responsePayload.length,
      id: requestId,
      end: true
    }))
    readerStream.push(responsePayload)
    readerStream.push(serializeHeader({
      type: PayloadTypes.Stream,
      payloadLength: responseBody.length,
      id: responseStreamId,
      end: true
    }))
    readerStream.push(responseBody)

    const response = await responsePromise
    assert.strictEqual(response.statusCode, 200)
    assert.deepStrictEqual(response.body, responseBody)

    await protocol.dispose()
  })

  it('rejects a pending streamed response when its stream is cancelled', async () => {
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    protocol.start()

    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    const responsePromise = protocol.sendRequest('POST', '/cancelled-response', Buffer.from('request-body', 'utf8'))
    const requestId = await waitFor(() => {
      const combined = Buffer.concat(written)
      return combined.length >= 48 ? combined.subarray(9, 45).toString('ascii').trim() : undefined
    })

    const responseStreamId = 'eeeeeeee-6666-6666-6666-666666666666'
    const responsePayload = Buffer.from(JSON.stringify({
      statusCode: 200,
      streams: [{ id: responseStreamId, type: 'application/json', length: 10 }]
    }), 'utf8')

    readerStream.push(serializeHeader({
      type: PayloadTypes.Response,
      payloadLength: responsePayload.length,
      id: requestId,
      end: true
    }))
    readerStream.push(responsePayload)
    readerStream.push(serializeHeader({
      type: PayloadTypes.CancelStream,
      payloadLength: 0,
      id: responseStreamId,
      end: true
    }))

    await assert.rejects(async () => await responsePromise, /Peer cancelled stream/)
    await protocol.dispose()
  })

  it('writes a CancelAll frame when sendCancelAll is called', async () => {
    const { reader, writer, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)

    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    await protocol.sendCancelAll()

    const parsed = await waitForFrame(written)

    assert.strictEqual(parsed.header.type, PayloadTypes.CancelAll)
    assert.strictEqual(parsed.header.id, '00000000-0000-0000-0000-000000000000')
    assert.strictEqual(parsed.header.payloadLength, 0)

    await protocol.dispose()
  })

  it('resolves completion when the connection closes during an idle read', async () => {
    const { reader, writer, readerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    protocol.start()

    readerStream.destroy()

    await Promise.race([
      protocol.completion,
      new Promise<void>((_resolve, reject) => setTimeout(() => reject(new Error('timeout')), 1000))
    ])

    await protocol.dispose()
  })

  it('does NOT attempt to drain when a multi-frame stream ends truncated (no unframed bytes on wire)', async () => {
    // Regression for production hang: when a stream arrives as multiple
    // properly framed chunks (frame1 end=false, frame2 end=false, frame3
    // end=true) and the final received length is less than the declared
    // expectedLength, the sender simply truncated — there are NO trailing
    // unframed bytes on the wire. Attempting to drain would block forever
    // waiting for bytes that don't exist. The protocol MUST accept the
    // truncated stream and continue reading the next frame normally.
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    const dispatched: NamedPipeRequest[] = []
    protocol.onRequestReceived = async (req) => {
      dispatched.push(req)
      return { statusCode: 200, body: null }
    }
    protocol.start()

    const bodyStreamId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    const attachmentId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    const followUpId = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

    // Request declaring a 262144-byte attachment that will be truncated
    // across 3 framed chunks of 4096 totaling 12288.
    const reqPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/multi-frame-truncated',
      streams: [
        { id: bodyStreamId, type: 'application/json', length: 4 },
        { id: attachmentId, type: 'application/octet-stream', length: 262144 }
      ]
    }), 'utf8')
    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: reqPayload.length, id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', end: true }))
    readerStream.push(reqPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4, id: bodyStreamId, end: true }))
    readerStream.push(Buffer.from('null', 'utf8'))
    // 3 framed chunks: first 2 end=false, last end=true. Total = 12288 << 262144.
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4096, id: attachmentId, end: false }))
    readerStream.push(Buffer.alloc(4096, 0xa1))
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4096, id: attachmentId, end: false }))
    readerStream.push(Buffer.alloc(4096, 0xa2))
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4096, id: attachmentId, end: true }))
    readerStream.push(Buffer.alloc(4096, 0xa3))

    // A second request immediately after — its header MUST be read at the
    // correct offset. If the protocol tried to drain 249856 bytes for the
    // attachment, it would either hang forever or consume this header and
    // desynchronize framing.
    const followUpPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/after-truncated',
      streams: [{ id: followUpId, type: 'application/json', length: 2 }]
    }), 'utf8')
    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: followUpPayload.length, id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', end: true }))
    readerStream.push(followUpPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 2, id: followUpId, end: true }))
    readerStream.push(Buffer.from('{}', 'utf8'))

    await waitFor(() => dispatched.length >= 2 ? dispatched : undefined, 2000)

    assert.strictEqual(dispatched.length, 2, 'both requests must dispatch — second proves the protocol did NOT block on a phantom drain')
    assert.strictEqual(dispatched[0].path, '/multi-frame-truncated')
    assert.strictEqual(dispatched[0].attachments.length, 1)
    assert.strictEqual(dispatched[0].attachments[0].body.length, 12288, 'truncated multi-frame stream delivers exactly the framed bytes')
    assert.strictEqual(dispatched[1].path, '/after-truncated')

    await protocol.dispose()
  })

  it('drains trailing unframed bytes when DL ASE writes more raw data after end=true (single-frame DirectLineFlex compat)', async () => {
    // Real-world DL ASE behavior: sends a Stream frame with payloadLength=4096
    // end=true but then writes MORE unframed bytes immediately after the frame
    // payload to flush the rest of a large attachment. We MUST consume these
    // bytes or the next readExact(48) for the following header will start
    // mid-payload and silently desynchronize all subsequent framing.
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    const dispatched: NamedPipeRequest[] = []
    protocol.onRequestReceived = async (req) => {
      dispatched.push(req)
      return { statusCode: 200, body: null }
    }
    protocol.start()

    const bodyStreamId = '11111111-1111-1111-1111-111111111111'
    const attachmentId = '22222222-2222-2222-2222-222222222222'
    const attachmentLen = 262144
    const framedLen = 4096
    const trailingLen = attachmentLen - framedLen

    const requestPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/api/messages',
      streams: [
        { id: bodyStreamId, type: 'application/json', length: 4 },
        { id: attachmentId, type: 'application/octet-stream', length: attachmentLen }
      ]
    }), 'utf8')

    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: requestPayload.length, id: '33333333-3333-3333-3333-333333333333', end: true }))
    readerStream.push(requestPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4, id: bodyStreamId, end: true }))
    readerStream.push(Buffer.from('null', 'utf8'))

    // Attachment: framed 4KB chunk end=true, then 252KB raw unframed bytes
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: framedLen, id: attachmentId, end: true }))
    readerStream.push(Buffer.alloc(framedLen, 0xab))

    // Trickle the trailing bytes in 32KB chunks across several ticks to prove
    // the BLOCKING drain waits as long as needed (regression: the old 200ms
    // timeout silently consumed partial data and corrupted framing).
    const tickSize = 32 * 1024
    ;(async () => {
      for (let offset = 0; offset < trailingLen; offset += tickSize) {
        await delay(40)
        readerStream.push(Buffer.alloc(Math.min(tickSize, trailingLen - offset), 0xcd))
      }
    })().catch(() => {})

    const result = await waitFor(() => dispatched.length >= 1 ? dispatched : undefined, 5000)
    assert.strictEqual(result.length, 1)
    assert.strictEqual(result[0].attachments.length, 1)
    assert.strictEqual(result[0].attachments[0].body.length, attachmentLen, 'full attachment reassembled from framed + trailing unframed bytes')
    assert.strictEqual(result[0].attachments[0].body[0], 0xab)
    assert.strictEqual(result[0].attachments[0].body[framedLen - 1], 0xab)
    assert.strictEqual(result[0].attachments[0].body[framedLen], 0xcd)
    assert.strictEqual(result[0].attachments[0].body[attachmentLen - 1], 0xcd)

    await protocol.dispose()
  })

  it('tears down the protocol when the pipe closes mid-drain', async () => {
    // The blocking trailing-bytes drain only fails fatally when the pipe
    // physically closes mid-drain. The framing would be corrupt at that
    // point, so we tear down and force a reconnect rather than silently
    // accept truncated data.
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    let dispatched = false
    protocol.onRequestReceived = async () => {
      dispatched = true
      return { statusCode: 200, body: null }
    }
    protocol.start()

    const streamId = '99999999-9999-9999-9999-999999999999'
    const requestPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/truncated',
      streams: [{ id: streamId, type: 'application/octet-stream', length: 100 }]
    }), 'utf8')

    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: requestPayload.length, id: '88888888-8888-8888-8888-888888888888', end: true }))
    readerStream.push(requestPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 5, id: streamId, end: true }))
    readerStream.push(Buffer.from('short', 'utf8'))

    await delay(50)
    readerStream.destroy()

    await Promise.race([protocol.completion, delay(1000)])

    assert.strictEqual(dispatched, false, 'request must NOT dispatch when pipe closes mid-drain')
    assert.strictEqual(written.length, 0, 'no frames written after fatal framing error')

    await protocol.dispose()
  })

  it('correctly reassembles a large attachment delivered as multiple end=false frames + final end=true (no drain needed)', async () => {
    // Sanity check: when the sender properly framed every byte and the last
    // frame's end=true accumulates to exactly expectedLength, the trailing-
    // bytes drain must be a no-op and dispatch must succeed normally.
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    let received: NamedPipeRequest | null = null
    protocol.onRequestReceived = async (req) => {
      received = req
      return { statusCode: 200, body: null }
    }
    protocol.start()

    const bodyStreamId = '11111111-1111-1111-1111-111111111111'
    const attachmentStreamId = '22222222-2222-2222-2222-222222222222'
    const attachmentLen = 262144
    const chunkSize = 65536

    const requestPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/api/messages',
      streams: [
        { id: bodyStreamId, type: 'application/json', length: 4 },
        { id: attachmentStreamId, type: 'application/octet-stream', length: attachmentLen }
      ]
    }), 'utf8')

    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: requestPayload.length, id: '33333333-3333-3333-3333-333333333333', end: true }))
    readerStream.push(requestPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 4, id: bodyStreamId, end: true }))
    readerStream.push(Buffer.from('null', 'utf8'))

    for (let offset = 0; offset < attachmentLen; offset += chunkSize) {
      const isLast = offset + chunkSize >= attachmentLen
      readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: chunkSize, id: attachmentStreamId, end: isLast }))
      readerStream.push(Buffer.alloc(chunkSize, 0xab))
    }

    const got = await waitFor(() => received ?? undefined, 5000)
    assert.strictEqual(got.attachments.length, 1)
    assert.strictEqual(got.attachments[0].body.length, attachmentLen)
    assert.strictEqual(got.attachments[0].body[0], 0xab)
    assert.strictEqual(got.attachments[0].body[attachmentLen - 1], 0xab)

    await protocol.dispose()
  })

  it('does NOT hang on an empty Stream frame (payloadLength=0) — regression for readExact(0)', async () => {
    // Latent bug: an empty Stream frame (payloadLength=0, end=true) causes
    // readExact(0) to be invoked for the payload. The pre-guard implementation
    // attached a data listener and waited forever because 0 bytes never
    // triggers the data event. This was the actual root cause of the earlier
    // "pipe blocking after large attachment" symptom: after the trailing-
    // bytes drain succeeded, the very next frame was an empty Stream frame
    // and the read loop wedged on readExact(0).
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))

    const dispatched: NamedPipeRequest[] = []
    protocol.onRequestReceived = async (req) => {
      dispatched.push(req)
      return { statusCode: 200, body: null }
    }
    protocol.start()

    const bodyStreamId = '44444444-4444-4444-4444-444444444444'
    const followUpId = '55555555-5555-5555-5555-555555555555'

    const reqPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/empty-frame',
      streams: [{ id: bodyStreamId, type: 'application/json', length: 0 }]
    }), 'utf8')

    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: reqPayload.length, id: '66666666-6666-6666-6666-666666666666', end: true }))
    readerStream.push(reqPayload)
    // Empty Stream frame — payloadLength=0, end=true. No payload bytes follow.
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 0, id: bodyStreamId, end: true }))

    // A follow-up request to prove the read loop didn't wedge on the empty frame.
    const followUpPayload = Buffer.from(JSON.stringify({
      verb: 'POST',
      path: '/after-empty',
      streams: [{ id: followUpId, type: 'application/json', length: 2 }]
    }), 'utf8')
    readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: followUpPayload.length, id: '77777777-7777-7777-7777-777777777777', end: true }))
    readerStream.push(followUpPayload)
    readerStream.push(serializeHeader({ type: PayloadTypes.Stream, payloadLength: 2, id: followUpId, end: true }))
    readerStream.push(Buffer.from('{}', 'utf8'))

    await waitFor(() => dispatched.length >= 2 ? dispatched : undefined, 2000)

    assert.strictEqual(dispatched.length, 2, 'second request must dispatch — proves readExact(0) returned immediately rather than hanging')
    assert.strictEqual(dispatched[0].path, '/empty-frame')
    assert.strictEqual(dispatched[1].path, '/after-empty')

    await protocol.dispose()
  })

  it('returns 503 instead of dispatching beyond the in-flight request limit', async () => {
    const { reader, writer, readerStream, writerStream } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    const written: Buffer[] = []
    let dispatches = 0

    writerStream.on('data', (chunk: Buffer) => written.push(Buffer.from(chunk)))
    protocol.onRequestReceived = async () => {
      dispatches++
      return await new Promise(() => {})
    }
    protocol.start()

    for (let i = 0; i < MAX_INFLIGHT_DISPATCHES + 1; i++) {
      const requestId = `77777777-7777-7777-7777-${i.toString().padStart(12, '0')}`
      const payload = Buffer.from(JSON.stringify({ verb: 'POST', path: `/request-${i}`, streams: null }), 'utf8')
      readerStream.push(serializeHeader({ type: PayloadTypes.Request, payloadLength: payload.length, id: requestId, end: true }))
      readerStream.push(payload)
    }

    const parsed = await waitForFrame(written, 1000)
    const responsePayload = JSON.parse(parsed.payload.toString('utf8'))

    assert.strictEqual(dispatches, MAX_INFLIGHT_DISPATCHES)
    assert.strictEqual(parsed.header.type, PayloadTypes.Response)
    assert.strictEqual(responsePayload.statusCode, 503)

    await protocol.dispose()
  })

  it('rejects caller-supplied attachment ids that are not 36-character GUIDs', async () => {
    // serializeHeader truncates ids to the fixed 36-character slot, so any
    // longer id would silently mismatch between the stream descriptor (full
    // id in JSON) and the stream frame (truncated id on the wire). The
    // receiver would wait for a stream that never completes.
    const { reader, writer } = createTransportPair()
    const protocol = new NamedPipeProtocol(reader, writer)
    protocol.start()

    await assert.rejects(
      async () => await protocol.sendRequest('POST', '/p', null, [
        { id: 'not-a-guid-but-definitely-longer-than-36-chars', contentType: 'image/png', body: Buffer.from([1, 2, 3]) }
      ], 'application/json'),
      /not a valid 36-character GUID/
    )

    await protocol.dispose()
  })

  it('emits a zero-length primary descriptor for attachment-only requests so the receiver does not mis-classify attachments', async () => {
    // Regression: when body=null but attachments are present, the sender used
    // to omit the primary descriptor and the first attachment slid into
    // streams[0], reappearing on the receiver as request.body instead of
    // request.attachments[0].
    const { reader: aReader, writer: aWriter, readerStream: aReaderStream, writerStream: aWriterStream } = createTransportPair()
    const { reader: bReader, writer: bWriter, readerStream: bReaderStream, writerStream: bWriterStream } = createTransportPair()

    // Wire A's writer to B's reader and vice versa
    aWriterStream.on('data', (chunk: Buffer) => bReaderStream.push(Buffer.from(chunk)))
    bWriterStream.on('data', (chunk: Buffer) => aReaderStream.push(Buffer.from(chunk)))

    const a = new NamedPipeProtocol(aReader, aWriter)
    const b = new NamedPipeProtocol(bReader, bWriter)

    let received: NamedPipeRequest | null = null
    b.onRequestReceived = async (req) => {
      received = req
      return { statusCode: 200, body: null }
    }

    a.start()
    b.start()

    await a.sendRequest('POST', '/attach-only', null, [
      { id: '11111111-1111-1111-1111-111111111111', contentType: 'image/png', body: Buffer.from([0xde, 0xad, 0xbe, 0xef]) }
    ], 'application/json')

    const got = await waitFor(() => received, 1500)
    assert.strictEqual(got.body, null, 'body must be null when caller passed null')
    assert.strictEqual(got.attachments.length, 1, 'attachment must round-trip into attachments[]')
    assert.deepStrictEqual(Array.from(got.attachments[0].body), [0xde, 0xad, 0xbe, 0xef])
    assert.strictEqual(got.attachments[0].id, '11111111-1111-1111-1111-111111111111')

    await a.dispose()
    await b.dispose()
  })
})
