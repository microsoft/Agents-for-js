// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { randomUUID } from 'node:crypto'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug, trace } from '@microsoft/agents-telemetry'
import { NamedPipeTransport } from '../transport/namedPipeTransport.js'
import { HEADER_SIZE, deserializeHeader, serializeHeader, type Header } from '../transport/header.js'
import {
  PayloadTypes,
  MAX_PAYLOAD_SIZE,
  MAX_STREAM_BUFFERS,
  MAX_STREAM_SIZE,
  MAX_STREAM_CHUNK_SIZE,
  REQUEST_TIMEOUT_MS,
  MAX_INFLIGHT_DISPATCHES,
  MAX_BUFFERED_AND_INFLIGHT_BYTES
} from './payloadModels.js'
import type { NamedPipeRequest, NamedPipeAttachment } from './namedPipeRequest.js'
import type { NamedPipeResponse } from './namedPipeResponse.js'
import { Errors } from '../errorHelper.js'
import { NamedPipeTraceDefinitions } from '../observability/traces.js'

const logger = debug('agents:named-pipe-protocol')

/**
 * Wire-frame ids are written into a fixed 36-character ASCII slot in the
 * header (see {@link serializeHeader}). Any caller-supplied id used to
 * correlate stream frames with stream descriptors must conform to this shape
 * — otherwise the receiver waits for a stream id that will never appear on
 * the wire.
 */
const ATTACHMENT_ID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * Describes a data stream attached to a request or response payload.
 * Matches the .NET PayloadDescription JSON schema.
 * Note: The JSON property is "type" (matching .NET [JsonPropertyName("type")]).
 */
interface PayloadDescription {
  id: string
  type?: string
  length?: number
}

/** JSON payload for a Request frame (Type='A'). */
interface RequestPayload {
  verb: string
  path: string
  streams?: PayloadDescription[] | null
}

/** JSON payload for a Response frame (Type='B'). */
interface ResponsePayload {
  statusCode: number
  streams?: PayloadDescription[] | null
}

interface PendingRequest {
  resolve: (response: NamedPipeResponse) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
  /** Timestamp when the request was created (for diagnostics) */
  createdAt: number
  /** The verb+path for logging */
  label: string
}

/** Pending inbound request waiting for its stream body to complete. */
interface PendingDispatch {
  header: Header
  payload: RequestPayload
}

/** Pending inbound response waiting for its stream body to complete. */
interface PendingResponseDispatch {
  payload: ResponsePayload
}

/** Extracted payload from stream descriptors. */
interface ExtractedPayload {
  body: Buffer | null
  contentType: string
  attachments: NamedPipeAttachment[]
}

/**
 * Implements the Bot Framework named pipe framing protocol.
 * Compatible with the .NET `Microsoft.Agents.Hosting.DirectLine.NamedPipes` wire format.
 *
 * Protocol features:
 * - 48-byte ASCII headers: `{Type}.{Length:6}.{Id:36}.{End}\n`
 * - Multi-frame streaming: request/response bodies sent as separate 'S' frames
 * - Multi-stream attachments: Streams[1..N] are attachment payloads
 * - CancelStream / CancelAll frame handling
 * - Request/response correlation by GUID
 */
export class NamedPipeProtocol {
  private readonly _reader: NamedPipeTransport
  private readonly _writer: NamedPipeTransport
  private readonly _pendingRequests = new Map<string, PendingRequest>()
  private readonly _inflightDispatches = new Map<string, AbortController>()
  private readonly _inflightDispatchSizes = new Map<string, number>()
  private _running = false
  private _writeFailed = false
  private _completionResolve: (() => void) | null = null
  private readonly _completion: Promise<void>
  private _writePromise: Promise<void> = Promise.resolve()
  private _lastFrameAt = Date.now()
  private _consecutiveOutboundFailures = 0

  /** Callback invoked when a request is received from the remote end. */
  onRequestReceived: ((request: NamedPipeRequest, signal?: AbortSignal) => Promise<NamedPipeResponse>) | null = null

  private _diagnosticInterval: ReturnType<typeof setInterval> | null = null

  constructor (reader: NamedPipeTransport, writer: NamedPipeTransport) {
    this._reader = reader
    this._writer = writer
    this._completion = new Promise((resolve) => { this._completionResolve = resolve })
  }

  /** Promise that resolves when the protocol loop ends. */
  get completion (): Promise<void> {
    return this._completion
  }

  /** Starts the read loop. */
  start (): void {
    if (this._running) return
    this._running = true
    this._startDiagnosticInterval()
    this._readLoop().catch((err) => {
      logger.debug(`Read loop error: ${err}`)
    })
  }

  /**
   * Sends a request over the pipe and waits for the correlated response.
   * Body is sent as a separate Stream frame (matching .NET protocol).
   * Optional attachments are sent as additional stream frames (Streams[1..N]).
   */
  async sendRequest (
    verb: string,
    path: string,
    body: Buffer | null,
    attachments?: NamedPipeAttachment[] | null,
    contentType?: string | null
  ): Promise<NamedPipeResponse> {
    const requestId = randomUUID()
    const attachmentIds = this._materializeAttachmentIds(attachments)

    // Wire contract: streams[0] is always the primary body, streams[1..N] are
    // attachments. When the caller provides attachments without a body we still
    // emit a zero-length primary stream descriptor so the receiver doesn't
    // misclassify the first attachment as the body.
    const hasAttachments = attachmentIds.length > 0
    const needsPrimaryStream = body !== null || hasAttachments
    const bodyStreamId = needsPrimaryStream ? randomUUID() : null

    const streams = this._buildStreamDescriptors(
      bodyStreamId, body?.length ?? 0, attachments, attachmentIds, contentType
    )

    const requestPayload: RequestPayload = { verb, path, streams }
    const payloadJson = Buffer.from(JSON.stringify(requestPayload), 'utf8')

    if (payloadJson.length > MAX_PAYLOAD_SIZE) {
      throw ExceptionHelper.generateException(Error, Errors.PipePayloadTooLarge, undefined, {
        size: String(payloadJson.length),
        max: String(MAX_PAYLOAD_SIZE)
      })
    }

    logger.info(`[SEND_REQUEST] Outbound ${verb} ${path} id=${requestId} bodyLen=${body?.length ?? 0}`)

    const responsePromise = new Promise<NamedPipeResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pendingRequests.delete(requestId)
        this._consecutiveOutboundFailures++
        logger.error(`[SEND_REQUEST] TIMEOUT after ${REQUEST_TIMEOUT_MS}ms for ${requestId} (${verb} ${path}). ` +
          `Remaining pending: ${this._pendingRequests.size} [${this._getPendingRequestSummary()}] consecutiveFailures=${this._consecutiveOutboundFailures}`)
        reject(ExceptionHelper.generateException(Error, Errors.PipeRequestTimeout, undefined, {
          timeout: String(REQUEST_TIMEOUT_MS)
        }))
        this._checkHealth()
      }, REQUEST_TIMEOUT_MS)

      this._pendingRequests.set(requestId, { resolve, reject, timer, createdAt: Date.now(), label: `${verb} ${path}` })
    })
    responsePromise.catch(() => {})

    // Send request frame — always end=true (the JSON envelope is complete in one frame;
    // body bytes travel under their own stream id per Bot.Streaming framing)
    const requestHeader: Header = {
      type: PayloadTypes.Request,
      payloadLength: payloadJson.length,
      id: requestId,
      end: true
    }

    try {
      await this._writeFrame(requestHeader, payloadJson)

      // Send body as stream frame if present (or a single empty frame if we
      // emitted a placeholder primary descriptor for an attachment-only request).
      if (bodyStreamId) {
        await this._sendStreamFrames(bodyStreamId, body ?? Buffer.alloc(0))
      }

      // Send attachment stream frames
      await this._sendAttachmentFrames(attachments, attachmentIds)
      logger.debug(`[SEND_REQUEST] All frames written for ${requestId}, awaiting response...`)
    } catch (err) {
      // Clean up the pending request to prevent orphaned timer/promise
      const pending = this._pendingRequests.get(requestId)
      if (pending) {
        clearTimeout(pending.timer)
        this._pendingRequests.delete(requestId)
      }
      logger.error(`[SEND_REQUEST] Write failed for ${requestId}: ${(err as Error)?.message}`)
      throw err
    }

    return responsePromise
  }

  /** Sends a CancelAll frame to the peer. */
  async sendCancelAll (): Promise<void> {
    await this._sendSingleFrame(PayloadTypes.CancelAll, '00000000-0000-0000-0000-000000000000', Buffer.alloc(0), true)
  }

  /** Sends a CancelStream frame for the given stream id. */
  async sendCancelStream (streamId: string): Promise<void> {
    await this._sendSingleFrame(PayloadTypes.CancelStream, streamId, Buffer.alloc(0), true)
  }

  /** Shuts down the protocol and rejects all pending requests. */
  async dispose (): Promise<void> {
    this._running = false
    if (this._diagnosticInterval) {
      clearInterval(this._diagnosticInterval)
      this._diagnosticInterval = null
    }

    // Best-effort: tell the peer we're shutting down
    try {
      await Promise.race([
        this.sendCancelAll(),
        new Promise<void>((resolve) => setTimeout(resolve, 500))
      ])
    } catch {
      // Pipe may already be gone
    }

    // Abort all in-flight dispatches
    for (const [, controller] of this._inflightDispatches) {
      try { controller.abort() } catch { /* already aborted */ }
    }
    this._inflightDispatches.clear()
    this._inflightDispatchSizes.clear()

    this._failPendingRequests(ExceptionHelper.generateException(Error, Errors.PipeNotConnected))
    this._completionResolve?.()
  }

  // ─── Read Loop ──────────────────────────────────────────────────────────

  private async _readLoop (): Promise<void> {
    const streamBuffers = new Map<string, Buffer[]>()
    const streamSizes = new Map<string, number>()
    const completedStreams = new Set<string>()
    const expectedStreamLengths = new Map<string, number>()
    const pendingDispatches = new Map<string, PendingDispatch>()
    const pendingResponses = new Map<string, PendingResponseDispatch>()
    let frameCount = 0

    logger.info('[READ_LOOP] Started')

    try {
      while (this._running) {
        logger.debug(`[READ_LOOP] Waiting for next frame... (frameCount=${frameCount}, inflight=${this._inflightDispatches.size}, pendingOutbound=${this._pendingRequests.size})`)
        const headerResult = await this._reader.readExact(HEADER_SIZE)
        if (!headerResult.success) {
          logger.warn('[READ_LOOP] Connection closed during header read — pipe disconnected')
          break
        }

        frameCount++
        this._lastFrameAt = Date.now()
        this._consecutiveOutboundFailures = 0
        const header = deserializeHeader(headerResult.data)
        logger.debug(`[READ_LOOP] Frame #${frameCount}: type=${header.type} id=${header.id} len=${header.payloadLength} end=${header.end}`)

        let payload: Buffer | null = null
        if (header.payloadLength > 0) {
          if (header.payloadLength > MAX_PAYLOAD_SIZE) {
            logger.debug(`Payload size ${header.payloadLength} exceeds maximum ${MAX_PAYLOAD_SIZE}. Disconnecting.`)
            break
          }
          const payloadResult = await this._reader.readExact(header.payloadLength)
          if (!payloadResult.success) {
            logger.debug('Connection closed during payload read')
            break
          }
          payload = payloadResult.data
        }

        // Bot.Streaming / DirectLineFlex compatibility: the DL ASE can send a Stream
        // frame with End=true but then write MORE unframed bytes after the declared
        // PayloadLength when the sender's content stream is larger than what fits in
        // the chunked frames. When the stream descriptor declares a length larger
        // than what has been received (including prior chunks), we MUST read the
        // trailing raw bytes so they don't corrupt subsequent header reads.
        if (header.type === PayloadTypes.Stream && header.end) {
          payload = await this._readTrailingStreamBytesIfNeeded(
            header, payload, streamSizes, expectedStreamLengths
          )
        }

        let connected = true
        switch (header.type) {
          case PayloadTypes.Request:
            this._handleRequestFrame(header, payload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingDispatches)
            break
          case PayloadTypes.Response:
            this._handleResponseFrame(header, payload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingResponses)
            break
          case PayloadTypes.Stream:
            connected = this._handleStreamFrame(header, payload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
            break
          case PayloadTypes.CancelAll:
            logger.warn('Received CancelAll from peer')
            this._handleCancelAllFrame(streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingDispatches, pendingResponses)
            break
          case PayloadTypes.CancelStream:
            logger.info(`Received CancelStream for ${header.id}`)
            this._handleCancelStreamFrame(header.id, streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingDispatches, pendingResponses)
            break
          default:
            logger.debug(`Unknown frame type: ${header.type}`)
        }

        if (!connected) break

        // Try dispatching any pending requests/responses whose streams are now complete
        this._tryDispatchPendingRequests(streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingDispatches)
        this._tryCompletePendingResponses(streamBuffers, streamSizes, completedStreams, expectedStreamLengths, pendingResponses)
      }
    } catch (err) {
      logger.error(`[READ_LOOP] Exception: ${err}`)
    } finally {
      logger.warn(`[READ_LOOP] Ended after ${frameCount} frames. inflight=${this._inflightDispatches.size} pendingOutbound=${this._pendingRequests.size}`)
      this._running = false
      if (this._diagnosticInterval) {
        clearInterval(this._diagnosticInterval)
        this._diagnosticInterval = null
      }
      this._failPendingRequests(ExceptionHelper.generateException(Error, Errors.PipeNotConnected))
      streamBuffers.clear()
      streamSizes.clear()
      completedStreams.clear()
      expectedStreamLengths.clear()
      pendingDispatches.clear()
      pendingResponses.clear()
      this._completionResolve?.()
      logger.info('[READ_LOOP] Completion resolved — reconnect loop can proceed')
    }
  }

  // ─── Frame Handlers ────────────────────────────────────────────────────

  private _handleRequestFrame (
    header: Header,
    payload: Buffer | null,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingDispatches: Map<string, PendingDispatch>
  ): void {
    if (!payload) return

    const requestPayload = JSON.parse(payload.toString('utf8')) as RequestPayload
    if (!requestPayload) return

    logger.debug(`Inbound Request id=${header.id} verb=${requestPayload.verb} path=${requestPayload.path} streamCount=${requestPayload.streams?.length ?? 0}`)

    this._trackExpectedStreamLengths(requestPayload.streams, expectedStreamLengths)

    // Check if ALL streams are complete before dispatching
    if (requestPayload.streams && requestPayload.streams.length > 0) {
      if (!this._allStreamsComplete(requestPayload.streams, completedStreams)) {
        pendingDispatches.set(header.id, { header, payload: requestPayload })
        return
      }
    }

    const extracted = this._extractRequestPayload(requestPayload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
    this._startDispatch(header, requestPayload, extracted)
  }

  private _handleResponseFrame (
    header: Header,
    payload: Buffer | null,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingResponses: Map<string, PendingResponseDispatch>
  ): void {
    if (!payload) {
      // A Response frame must always carry a JSON ResponsePayload (statusCode + streams).
      // A zero-payload response is a protocol violation (corrupted stream / broken relay).
      // Resolving it as 200 would mask real send failures, so we reject the pending request
      // so callers can observe and react to the protocol error.
      logger.error(`[RECV_RESPONSE] Protocol violation: empty Response frame for ${header.id}`)
      const pending = this._pendingRequests.get(header.id)
      if (pending) {
        clearTimeout(pending.timer)
        this._pendingRequests.delete(header.id)
        pending.reject(ExceptionHelper.generateException(Error, Errors.PipeProtocolError, undefined, {
          reason: `empty Response frame for request ${header.id}`
        }))
      } else {
        logger.warn(`[RECV_RESPONSE] No pending request found for ${header.id} (already timed out?)`)
      }
      return
    }

    const responsePayload = JSON.parse(payload.toString('utf8')) as ResponsePayload

    logger.info(`[RECV_RESPONSE] id=${header.id} status=${responsePayload.statusCode} streamCount=${responsePayload.streams?.length ?? 0} (hasPending=${this._pendingRequests.has(header.id)})`)

    this._trackExpectedStreamLengths(responsePayload.streams, expectedStreamLengths)

    if (responsePayload.streams && responsePayload.streams.length > 0) {
      if (!this._allStreamsComplete(responsePayload.streams, completedStreams)) {
        pendingResponses.set(header.id, { payload: responsePayload })
        return
      }
    }

    const extracted = this._extractResponsePayload(header.id, responsePayload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
    this._completeResponse(header.id, responsePayload, extracted)
  }

  private _handleStreamFrame (
    header: Header,
    payload: Buffer | null,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): boolean {
    if (streamBuffers.size >= MAX_STREAM_BUFFERS && !streamBuffers.has(header.id)) {
      logger.error(`Too many stream buffers (${MAX_STREAM_BUFFERS}). Disconnecting.`)
      return false
    }

    if (payload && payload.length > 0) {
      const currentSize = streamSizes.get(header.id) ?? 0
      if (currentSize + payload.length > MAX_STREAM_SIZE) {
        logger.error(`Stream ${header.id} exceeded maximum size (${MAX_STREAM_SIZE} bytes). Disconnecting.`)
        return false
      }

      const retainedBytes = this._getTotalStreamBytes(streamSizes) + this._getInflightDispatchBytes()
      if (retainedBytes + payload.length > MAX_BUFFERED_AND_INFLIGHT_BYTES) {
        logger.error(`Buffered and in-flight pipe data exceeded maximum size (${MAX_BUFFERED_AND_INFLIGHT_BYTES} bytes). Disconnecting.`)
        return false
      }

      const existing = streamBuffers.get(header.id)
      if (existing) {
        existing.push(payload)
      } else {
        streamBuffers.set(header.id, [payload])
      }
      const newSize = currentSize + payload.length
      streamSizes.set(header.id, newSize)

      const expected = expectedStreamLengths.get(header.id)
      logger.debug(`[STREAM] id=${header.id.substring(0, 8)} chunkLen=${payload.length} accumulated=${newSize}/${expected ?? '?'} end=${header.end}`)
    } else {
      logger.debug(`[STREAM] id=${header.id.substring(0, 8)} EMPTY frame end=${header.end}`)
    }

    if (header.end) {
      completedStreams.add(header.id)
      const received = streamSizes.get(header.id) ?? 0
      const expected = expectedStreamLengths.get(header.id)
      if (expected != null && received < expected) {
        logger.warn(`[STREAM] id=${header.id.substring(0, 8)} TRUNCATED: received=${received} expected=${expected} (${Math.round(received / expected * 100)}%) — .NET sender ended stream early`)
      } else {
        logger.info(`[STREAM] id=${header.id.substring(0, 8)} COMPLETE: received=${received} expected=${expected ?? 'unknown'}`)
      }
    }

    return true
  }

  private _handleCancelStreamFrame (
    streamId: string,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingDispatches: Map<string, PendingDispatch>,
    pendingResponses: Map<string, PendingResponseDispatch>
  ): void {
    // Following Bot.Streaming semantics: incoming CancelStream is silently dropped.
    // The affected transfer is abandoned without changing the wire protocol.
    this._removeStreamState(streamId, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)

    // Cancel in-flight dispatch if the id matches a request id
    const dispatchController = this._inflightDispatches.get(streamId)
    if (dispatchController) {
      try { dispatchController.abort() } catch { /* already aborted */ }
      this._inflightDispatches.delete(streamId)
      this._inflightDispatchSizes.delete(streamId)
    }

    for (const [requestId, dispatch] of pendingDispatches) {
      if (!this._payloadReferencesStream(dispatch.payload.streams, streamId)) continue
      pendingDispatches.delete(requestId)
      this._removeStreamsState(dispatch.payload.streams, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
      logger.info(`Dropped pending request ${requestId} due to CancelStream for stream ${streamId}`)
    }

    for (const [responseId, dispatch] of pendingResponses) {
      if (!this._payloadReferencesStream(dispatch.payload.streams, streamId)) continue
      pendingResponses.delete(responseId)
      this._removeStreamsState(dispatch.payload.streams, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)

      const pending = this._pendingRequests.get(responseId)
      if (pending) {
        clearTimeout(pending.timer)
        this._pendingRequests.delete(responseId)
        pending.reject(ExceptionHelper.generateException(Error, Errors.PipeStreamCancelled, undefined, { streamId }))
      }
      logger.info(`Dropped pending response ${responseId} due to CancelStream for stream ${streamId}`)
    }
  }

  private _handleCancelAllFrame (
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingDispatches: Map<string, PendingDispatch>,
    pendingResponses: Map<string, PendingResponseDispatch>
  ): void {
    streamBuffers.clear()
    streamSizes.clear()
    completedStreams.clear()
    expectedStreamLengths.clear()
    pendingDispatches.clear()
    pendingResponses.clear()

    // Cancel all in-flight dispatches
    for (const [, controller] of this._inflightDispatches) {
      try { controller.abort() } catch { /* already aborted */ }
    }
    this._inflightDispatches.clear()
    this._inflightDispatchSizes.clear()

    // Fail all outbound pending requests
    for (const [id, pending] of this._pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(ExceptionHelper.generateException(Error, Errors.PipeCancelledAll, undefined, { requestId: id }))
    }
    this._pendingRequests.clear()
  }

  // ─── Trailing Stream Bytes (DirectLineFlex Compatibility) ───────────────

  /**
   * Bot.Streaming / DirectLineFlex sends a SINGLE stream frame with End=true
   * but may write MORE raw bytes after the declared PayloadLength when the
   * sender's content stream is larger than what fits in the one chunked frame.
   * This reads those trailing unframed bytes so they don't corrupt the next
   * header read.
   *
   * Single-frame ONLY (mirrors .NET ReadTrailingSingleFrameStreamBytesIfNeededAsync):
   * if any prior chunked frames have arrived for this stream id, the sender
   * is using the standard multi-frame chunking path — every byte is on the
   * wire as part of a properly framed payload, and there are NO unframed
   * trailing bytes. In that path, end=true with received < expected simply
   * means the sender truncated the stream; trying to drain would block
   * forever waiting for bytes that don't exist.
   *
   * BLOCKING (no timeout): the sender already put these bytes on the wire and
   * we MUST consume every one of them. A timeout-based approach silently
   * desynchronizes framing because partially consuming the trailing bytes
   * leaves the next readExact(48) starting mid-payload. The only acceptable
   * failure mode is the connection actually closing, which we surface as fatal.
   */
  private async _readTrailingStreamBytesIfNeeded (
    header: Header,
    payload: Buffer | null,
    streamSizes: Map<string, number>,
    expectedStreamLengths: Map<string, number>
  ): Promise<Buffer | null> {
    const expectedLength = expectedStreamLengths.get(header.id)
    if (expectedLength == null) {
      return payload
    }

    const bufferedLength = streamSizes.get(header.id) ?? 0

    // Single-frame guard: only drain when this is the FIRST and ONLY frame
    // for the stream. Multi-frame chunked streams never have unframed
    // trailing bytes — the sender either chunks the full payload (no drain
    // needed) or truncates cleanly at end=true (no bytes to drain).
    if (bufferedLength > 0) {
      return payload
    }

    const receivedLength = payload?.length ?? 0
    if (receivedLength >= expectedLength) {
      return payload
    }

    const missing = expectedLength - receivedLength
    logger.warn(`[STREAM] id=${header.id.substring(0, 8)} end=true but received=${receivedLength} < expected=${expectedLength}; draining ${missing} trailing unframed bytes (DirectLineFlex compat)`)

    const retainedBytes = this._getTotalStreamBytes(streamSizes) + this._getInflightDispatchBytes()
    if (retainedBytes + (payload?.length ?? 0) + missing > MAX_BUFFERED_AND_INFLIGHT_BYTES) {
      // We MUST drain — the bytes are physically on the wire, refusing to
      // read them would leave the next header read starting mid-payload. If
      // honoring the drain would exceed our memory budget, tear down the
      // connection rather than corrupt framing or run unbounded.
      logger.error(`[STREAM] id=${header.id.substring(0, 8)} trailing bytes would exceed buffer limit (${retainedBytes + (payload?.length ?? 0) + missing} > ${MAX_BUFFERED_AND_INFLIGHT_BYTES}); tearing down connection.`)
      throw ExceptionHelper.generateException(Error, Errors.PipeResourceLimitExceeded, undefined, {
        reason: `trailing-bytes drain for ${header.id} would exceed buffer limit`
      })
    }

    const trailingResult = await this._reader.readExact(missing)

    if (!trailingResult.success) {
      logger.error(`[STREAM] id=${header.id.substring(0, 8)} pipe closed while draining ${missing} trailing bytes; tearing down connection.`)
      throw ExceptionHelper.generateException(Error, Errors.PipeTrailingStreamReadFailed, undefined, {
        streamId: header.id,
        missing: String(missing)
      })
    }

    logger.info(`[STREAM] id=${header.id.substring(0, 8)} drained ${missing} trailing bytes — stream now complete (${expectedLength} bytes)`)
    if (!payload || payload.length === 0) {
      return trailingResult.data
    }
    return Buffer.concat([payload, trailingResult.data])
  }

  // ─── Stream Completion ─────────────────────────────────────────────────

  private _allStreamsComplete (
    streams: PayloadDescription[],
    completedStreams: Set<string>
  ): boolean {
    for (const descriptor of streams) {
      if (!descriptor?.id) continue
      if (!completedStreams.has(descriptor.id)) return false
    }
    return true
  }

  private _trackExpectedStreamLengths (
    streams: PayloadDescription[] | null | undefined,
    expectedStreamLengths: Map<string, number>
  ): void {
    if (!streams) return
    for (const descriptor of streams) {
      if (descriptor?.id && descriptor.length != null && descriptor.length >= 0) {
        if (descriptor.length > MAX_STREAM_SIZE) {
          logger.warn(`Stream ${descriptor.id} declares length ${descriptor.length} exceeding MAX_STREAM_SIZE (${MAX_STREAM_SIZE}); capping`)
          expectedStreamLengths.set(descriptor.id, MAX_STREAM_SIZE)
        } else {
          expectedStreamLengths.set(descriptor.id, descriptor.length)
        }
        logger.debug(`Tracking stream ${descriptor.id} expectedLength=${expectedStreamLengths.get(descriptor.id)} type=${descriptor.type}`)
      }
    }
  }

  private _payloadReferencesStream (streams: PayloadDescription[] | null | undefined, streamId: string): boolean {
    return !!streams?.some(descriptor => descriptor?.id === streamId)
  }

  private _removeStreamsState (
    streams: PayloadDescription[] | null | undefined,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): void {
    if (!streams) return
    for (const descriptor of streams) {
      if (!descriptor?.id) continue
      this._removeStreamState(descriptor.id, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
    }
  }

  private _removeStreamState (
    streamId: string,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): void {
    streamBuffers.delete(streamId)
    streamSizes.delete(streamId)
    completedStreams.delete(streamId)
    expectedStreamLengths.delete(streamId)
  }

  // ─── Dispatch ──────────────────────────────────────────────────────────

  private _tryDispatchPendingRequests (
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingDispatches: Map<string, PendingDispatch>
  ): void {
    const dispatched: string[] = []
    for (const [requestId, dispatch] of pendingDispatches) {
      if (dispatch.payload.streams && this._allStreamsComplete(dispatch.payload.streams, completedStreams)) {
        dispatched.push(requestId)
        const extracted = this._extractRequestPayload(dispatch.payload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
        this._startDispatch(dispatch.header, dispatch.payload, extracted)
      }
    }
    for (const id of dispatched) pendingDispatches.delete(id)
  }

  private _tryCompletePendingResponses (
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>,
    pendingResponses: Map<string, PendingResponseDispatch>
  ): void {
    const completed: string[] = []
    for (const [responseId, dispatch] of pendingResponses) {
      if (dispatch.payload.streams && this._allStreamsComplete(dispatch.payload.streams, completedStreams)) {
        completed.push(responseId)
        const extracted = this._extractResponsePayload(responseId, dispatch.payload, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
        this._completeResponse(responseId, dispatch.payload, extracted)
      }
    }
    for (const id of completed) pendingResponses.delete(id)
  }

  // ─── Payload Extraction ────────────────────────────────────────────────

  private _extractRequestPayload (
    requestPayload: RequestPayload,
    streamBuffers: Map<string, Buffer[]>,
    _streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): ExtractedPayload {
    if (!requestPayload.streams || requestPayload.streams.length === 0) {
      return { body: null, contentType: 'application/json', attachments: [] }
    }

    const primary = requestPayload.streams[0]
    const body = this._takeStreamBody(primary, streamBuffers, _streamSizes, completedStreams, expectedStreamLengths)
    const attachments = this._takeAttachmentStreams(requestPayload.streams, streamBuffers, _streamSizes, completedStreams, expectedStreamLengths)
    const contentType = primary?.type || 'application/json'
    return { body, contentType, attachments }
  }

  private _extractResponsePayload (
    _requestId: string,
    responsePayload: ResponsePayload,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): ExtractedPayload {
    if (!responsePayload.streams || responsePayload.streams.length === 0) {
      return { body: null, contentType: 'application/json', attachments: [] }
    }

    const primary = responsePayload.streams[0]
    const body = this._takeStreamBody(primary, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
    const attachments = this._takeAttachmentStreams(responsePayload.streams, streamBuffers, streamSizes, completedStreams, expectedStreamLengths)
    const contentType = primary?.type || 'application/json'
    return { body, contentType, attachments }
  }

  /** Removes and returns the assembled bytes for a stream descriptor. */
  private _takeStreamBody (
    descriptor: PayloadDescription | undefined,
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): Buffer | null {
    if (!descriptor?.id) return null
    const streamId = descriptor.id

    const chunks = streamBuffers.get(streamId)
    streamBuffers.delete(streamId)
    streamSizes.delete(streamId)
    completedStreams.delete(streamId)
    expectedStreamLengths.delete(streamId)

    if (!chunks || chunks.length === 0) return null
    return Buffer.concat(chunks)
  }

  /** Removes and returns attachment streams (Streams[1..N]). */
  private _takeAttachmentStreams (
    streams: PayloadDescription[],
    streamBuffers: Map<string, Buffer[]>,
    streamSizes: Map<string, number>,
    completedStreams: Set<string>,
    expectedStreamLengths: Map<string, number>
  ): NamedPipeAttachment[] {
    if (streams.length <= 1) return []

    const attachments: NamedPipeAttachment[] = []
    for (let i = 1; i < streams.length; i++) {
      const descriptor = streams[i]
      if (!descriptor?.id) continue

      const chunks = streamBuffers.get(descriptor.id)
      streamBuffers.delete(descriptor.id)
      streamSizes.delete(descriptor.id)
      completedStreams.delete(descriptor.id)
      expectedStreamLengths.delete(descriptor.id)

      attachments.push({
        id: descriptor.id,
        contentType: descriptor.type || 'application/octet-stream',
        body: chunks && chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)
      })
    }
    return attachments
  }

  private _startDispatch (header: Header, requestPayload: RequestPayload, extracted: ExtractedPayload): void {
    if (!this.onRequestReceived) {
      logger.warn(`No onRequestReceived handler set, dropping request ${header.id}`)
      return
    }

    const requestSize = this._getExtractedPayloadSize(extracted)
    if (this._inflightDispatches.size >= MAX_INFLIGHT_DISPATCHES) {
      logger.warn(`Rejecting request ${header.id}: in-flight dispatch limit ${MAX_INFLIGHT_DISPATCHES} reached`)
      this._sendOverloadResponse(header.id)
      return
    }

    if (this._getInflightDispatchBytes() + requestSize > MAX_BUFFERED_AND_INFLIGHT_BYTES) {
      logger.warn(`Rejecting request ${header.id}: in-flight byte limit ${MAX_BUFFERED_AND_INFLIGHT_BYTES} would be exceeded`)
      this._sendOverloadResponse(header.id)
      return
    }

    const controller = new AbortController()
    this._inflightDispatches.set(header.id, controller)
    this._inflightDispatchSizes.set(header.id, requestSize)

    const request: NamedPipeRequest = {
      id: header.id,
      verb: requestPayload.verb,
      path: requestPayload.path,
      contentType: extracted.contentType,
      body: extracted.body,
      attachments: extracted.attachments
    }

    logger.info(`>>> [DISPATCH] Request ${header.id}: ${request.verb} ${request.path} (BodyLen=${extracted.body?.length ?? 0}, ContentType=${extracted.contentType}, Attachments=${extracted.attachments.length})`)
    if (extracted.body) {
      logger.debug(`>>> [DISPATCH] Body preview: ${extracted.body.toString('utf8').substring(0, 500)}`)
    }

    const dispatchStart = Date.now()

    const dispatchTrace = trace(NamedPipeTraceDefinitions.dispatch)
    dispatchTrace.record({ verb: request.verb, path: request.path })

    this.onRequestReceived(request, controller.signal)
      .then(async (response) => {
        const elapsed = Date.now() - dispatchStart
        logger.info(`<<< [DISPATCH] Handler completed for ${header.id} in ${elapsed}ms — status=${response.statusCode} bodyLen=${response.body?.length ?? 0}`)
        if (response.body) {
          logger.debug(`<<< [DISPATCH] Response body preview: ${response.body.toString('utf8').substring(0, 500)}`)
        }
        logger.debug(`<<< [DISPATCH] Writing response frame for ${header.id}...`)
        try {
          await this._sendResponse(header.id, response)
          logger.info(`<<< [DISPATCH] Response frame SENT for ${header.id} (total elapsed=${Date.now() - dispatchStart}ms)`)
        } catch (writeErr: any) {
          logger.error(`<<< [DISPATCH] Failed to send response for ${header.id}: ${writeErr?.message || writeErr}`)
        }
        dispatchTrace.record({ statusCode: response.statusCode })
        dispatchTrace.end()
      })
      .catch(async (err) => {
        const elapsed = Date.now() - dispatchStart
        if (controller.signal.aborted) {
          logger.warn(`[DISPATCH] Request ${header.id} was aborted after ${elapsed}ms`)
          dispatchTrace.end()
          return
        }
        logger.error(`!!! [DISPATCH] Error handling request ${header.id} after ${elapsed}ms: ${err?.message || err}`)
        logger.error(`!!! [DISPATCH] Stack: ${err?.stack}`)
        try {
          await this._sendResponse(header.id, { statusCode: 500, body: null })
        } catch (writeErr: any) {
          logger.error(`!!! [DISPATCH] Failed to send 500 response for ${header.id}: ${writeErr?.message || writeErr}`)
        }
        dispatchTrace.record({ statusCode: 500 })
        dispatchTrace.fail(err)
        dispatchTrace.end()
      })
      .finally(() => {
        this._inflightDispatches.delete(header.id)
        this._inflightDispatchSizes.delete(header.id)
        logger.debug(`[DISPATCH] Cleaned up inflight dispatch for ${header.id} (remaining inflight: ${this._inflightDispatches.size})`)
      })
  }

  private _sendOverloadResponse (requestId: string): void {
    this._sendResponse(requestId, { statusCode: 503, body: null }).catch((err: any) => {
      logger.error(`[DISPATCH] Failed to send overload response for ${requestId}: ${err?.message || err}`)
    })
  }

  private _getExtractedPayloadSize (payload: ExtractedPayload): number {
    let size = payload.body?.length ?? 0
    for (const attachment of payload.attachments) {
      size += attachment.body?.length ?? 0
    }
    return size
  }

  private _getTotalStreamBytes (streamSizes: Map<string, number>): number {
    let total = 0
    for (const size of streamSizes.values()) {
      total += size
    }
    return total
  }

  private _getInflightDispatchBytes (): number {
    let total = 0
    for (const size of this._inflightDispatchSizes.values()) {
      total += size
    }
    return total
  }

  private _completeResponse (requestId: string, responsePayload: ResponsePayload, extracted: ExtractedPayload): void {
    const pending = this._pendingRequests.get(requestId)
    if (pending) {
      clearTimeout(pending.timer)
      this._pendingRequests.delete(requestId)
      pending.resolve({
        statusCode: responsePayload.statusCode,
        contentType: extracted.contentType,
        body: extracted.body
      })
    } else {
      logger.warn(`Received response for unknown request ${requestId}`)
    }
  }

  // ─── Send Helpers ──────────────────────────────────────────────────────

  private async _sendResponse (id: string, response: NamedPipeResponse): Promise<void> {
    const bodyStreamId = response.body ? randomUUID() : null
    const attachmentIds = this._materializeAttachmentIds(undefined)
    const contentType = response.contentType || 'application/json'

    logger.debug(`_sendResponse id=${id} status=${response.statusCode} bodyLen=${response.body?.length ?? 0} contentType=${contentType}`)

    const streams = this._buildStreamDescriptors(
      bodyStreamId, response.body?.length ?? null, undefined, attachmentIds, contentType
    )

    const responsePayload: ResponsePayload = {
      statusCode: response.statusCode,
      streams
    }

    const payloadJson = Buffer.from(JSON.stringify(responsePayload), 'utf8')
    await this._sendSingleFrame(PayloadTypes.Response, id, payloadJson, true)

    if (response.body && bodyStreamId) {
      await this._sendStreamFrames(bodyStreamId, response.body)
    }
  }

  private async _sendStreamFrames (streamId: string, data: Buffer): Promise<void> {
    // Send in chunks up to MAX_STREAM_CHUNK_SIZE (65 536 bytes / 64 KB). The
    // .NET Bot.Streaming SDK chunks at 4 KB; we use the larger size to reduce
    // frame count for large attachments while staying well under MAX_PAYLOAD_SIZE.
    let offset = 0
    do {
      const chunkSize = Math.min(MAX_STREAM_CHUNK_SIZE, data.length - offset)
      const chunk = data.subarray(offset, offset + chunkSize)
      const isLast = offset + chunkSize >= data.length
      await this._sendSingleFrame(PayloadTypes.Stream, streamId, chunk, isLast)
      offset += chunkSize
    } while (offset < data.length)
  }

  private async _sendAttachmentFrames (
    attachments: NamedPipeAttachment[] | null | undefined,
    attachmentIds: string[]
  ): Promise<void> {
    if (!attachments || attachments.length === 0) return
    for (let i = 0; i < attachments.length; i++) {
      const body = attachments[i]?.body ?? Buffer.alloc(0)
      await this._sendStreamFrames(attachmentIds[i], body)
    }
  }

  /** Builds the Streams[] descriptor list for the wire. Returns null when no streams. */
  private _buildStreamDescriptors (
    bodyStreamId: string | null,
    bodyLength: number | null,
    attachments: NamedPipeAttachment[] | null | undefined,
    attachmentIds: string[],
    primaryContentType?: string | null
  ): PayloadDescription[] | null {
    const totalStreams = (bodyStreamId ? 1 : 0) + attachmentIds.length
    if (totalStreams === 0) return null

    const descriptors: PayloadDescription[] = []

    if (bodyStreamId) {
      descriptors.push({
        id: bodyStreamId,
        type: primaryContentType || 'application/json',
        length: bodyLength ?? undefined
      })
    }

    if (attachments) {
      for (let i = 0; i < attachments.length; i++) {
        const attachment = attachments[i]
        descriptors.push({
          id: attachmentIds[i],
          type: attachment?.contentType || 'application/octet-stream',
          length: attachment?.body?.length ?? 0
        })
      }
    }

    return descriptors
  }

  /**
   * Generates or reuses wire identifiers for attachments.
   *
   * Caller-supplied ids MUST match the 36-character GUID shape used by the
   * wire frame header — `serializeHeader()` truncates ids to 36 characters,
   * so any longer id would be silently truncated on the wire while the
   * stream descriptor's JSON payload still carried the full id, leaving the
   * peer waiting for a stream that never completes.
   */
  private _materializeAttachmentIds (attachments: NamedPipeAttachment[] | null | undefined): string[] {
    if (!attachments || attachments.length === 0) return []
    return attachments.map(a => {
      if (a?.id) {
        if (!ATTACHMENT_ID_PATTERN.test(a.id)) {
          throw ExceptionHelper.generateException(Error, Errors.PipeInvalidAttachmentId, undefined, { id: a.id })
        }
        return a.id
      }
      return randomUUID()
    })
  }

  // ─── Write Layer ───────────────────────────────────────────────────────

  /**
   * Sends a single frame (header + payload). Uses a sequential write queue to
   * prevent interleaving of header and payload bytes across concurrent calls.
   */
  private _sendSingleFrame (type: string, id: string, payload: Buffer, end: boolean): Promise<void> {
    // Fail-fast guard: once the writer has been torn down, every subsequent
    // caller must reject immediately rather than chain a new write onto the
    // already-failed _writePromise (which would race the teardown and produce
    // confusing "which write failed?" diagnostics).
    if (this._writeFailed) {
      return Promise.reject(ExceptionHelper.generateException(Error, Errors.PipeWriteFailed, undefined, { reason: 'writer has failed' }))
    }
    const doWrite = async () => {
      if (this._writeFailed) {
        throw ExceptionHelper.generateException(Error, Errors.PipeWriteFailed, undefined, { reason: 'writer has failed' })
      }
      const header: Header = { type, payloadLength: payload.length, id, end }
      const headerBuf = serializeHeader(header)
      await this._writer.write(headerBuf)
      if (payload.length > 0) {
        await this._writer.write(payload)
      }
    }

    // Chain writes to prevent interleaving. _handleWriteFailure is idempotent
    // (early-returns when _writeFailed is already true) so only the first
    // failure tears the protocol down.
    this._writePromise = this._writePromise
      .then(doWrite)
      .catch((err) => {
        this._handleWriteFailure(err)
        throw err
      })

    return this._writePromise
  }

  /** For backward compatibility — delegates to the write queue. */
  private async _writeFrame (header: Header, payload: Buffer): Promise<void> {
    await this._sendSingleFrame(header.type, header.id, payload, header.end)
  }

  /**
   * Called when a write to the pipe fails. Tears down the protocol so the
   * hosted service observes completion and triggers a reconnect.
   */
  private _handleWriteFailure (err: unknown): void {
    if (this._writeFailed) return
    this._writeFailed = true
    logger.warn(`Write failed; tearing down protocol to trigger reconnect: ${err}`)
    this._running = false
    this._failPendingRequests(ExceptionHelper.generateException(Error, Errors.PipeWriteFailed, err instanceof Error ? err : undefined, {
      reason: err instanceof Error ? err.message : String(err)
    }))
    this._completionResolve?.()
  }

  private _failPendingRequests (error: Error): void {
    for (const [id, pending] of this._pendingRequests) {
      const age = Date.now() - pending.createdAt
      logger.warn(`[FAIL_PENDING] Rejecting ${id} (${pending.label}) after ${age}ms: ${error.message}`)
      clearTimeout(pending.timer)
      pending.reject(error)
    }
    this._pendingRequests.clear()
  }

  // ─── Diagnostics ───────────────────────────────────────────────────────────

  /**
   * Health watchdog: if outbound requests are stuck and no frames have been
   * received from the relay recently, the relay is likely degraded. Proactively tear
   * down the connection so the server can reconnect with a fresh pipe.
   *
   * Triggered from: diagnostic interval (every 5s) and on outbound timeout.
   */
  private _checkHealth (): void {
    const now = Date.now()
    const silenceMs = now - this._lastFrameAt
    const SILENCE_THRESHOLD_MS = 20_000 // no frames from relay for 20s

    // Condition 1: any pending request older than 30s AND relay is silent
    if (this._pendingRequests.size > 0 && silenceMs >= SILENCE_THRESHOLD_MS) {
      const oldestAge = Math.max(...[...this._pendingRequests.values()].map(r => now - r.createdAt))
      if (oldestAge >= SILENCE_THRESHOLD_MS) {
        logger.error(`[HEALTH] Relay unresponsive: oldest pending request age=${oldestAge}ms, ` +
          `no frames received for ${silenceMs}ms, pending=${this._pendingRequests.size}. ` +
          'Tearing down connection to force reconnect.')
        this.dispose().catch(() => {})
        return
      }
    }

    // Condition 2: relay completely silent for 30s (no pending, no inflight, no frames)
    // This catches the case where a timeout already cleared pending requests but relay is dead
    if (silenceMs >= SILENCE_THRESHOLD_MS && this._consecutiveOutboundFailures > 0) {
      logger.error(`[HEALTH] Relay silent: no frames for ${silenceMs}ms after ${this._consecutiveOutboundFailures} outbound failure(s). ` +
        'Tearing down connection to force reconnect.')
      this.dispose().catch(() => {})
    }
  }

  /**
   * Periodic diagnostic dump: logs pending outbound requests and inflight
   * dispatches so we can see what's stuck and for how long.
   */
  private _startDiagnosticInterval (): void {
    // Every 5s, check health and log diagnostics
    this._diagnosticInterval = setInterval(() => {
      if (!this._running) return
      const now = Date.now()
      const pending = this._pendingRequests.size
      const inflight = this._inflightDispatches.size

      // Always run health check (even when nothing is pending — relay may have gone silent after a timeout)
      this._checkHealth()

      // Only log diagnostics when something is pending (reduce noise)
      if (pending === 0 && inflight === 0) return

      logger.info(`[DIAGNOSTICS] pendingOutbound=${pending} inflightDispatches=${inflight} writeFailed=${this._writeFailed} silenceMs=${now - this._lastFrameAt}`)

      if (pending > 0) {
        for (const [id, req] of this._pendingRequests) {
          const age = now - req.createdAt
          logger.info(`[DIAGNOSTICS]   pending: ${id.substring(0, 8)}... ${req.label} age=${age}ms`)
        }
      }
    }, 5_000).unref() // unref so it doesn't prevent process exit
  }

  /** Returns a concise summary of pending requests for error messages. */
  private _getPendingRequestSummary (): string {
    const now = Date.now()
    const entries: string[] = []
    for (const [id, req] of this._pendingRequests) {
      entries.push(`${id.substring(0, 8)}(${req.label},${now - req.createdAt}ms)`)
    }
    return entries.join(', ')
  }
}
