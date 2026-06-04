// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/** Header type constants for the named pipe framing protocol. */
export const PayloadTypes = {
  /** Inbound request frame */
  Request: 'A',
  /** Response frame */
  Response: 'B',
  /** Stream body frame */
  Stream: 'S',
  /** Cancel all pending operations */
  CancelAll: 'X',
  /** Cancel a specific stream */
  CancelStream: 'C'
} as const

/**
 * Maximum payload size per frame.
 * The header encodes length as 6 ASCII digits, so 999,999 is the hard ceiling.
 */
export const MAX_PAYLOAD_SIZE = 999_999

/**
 * Maximum payload size for stream frame chunks.
 * The .NET Bot.Streaming SDK uses 4096, but the relay supports up to MAX_PAYLOAD_SIZE.
 * Using 65536 (64KB) dramatically reduces frame count for large attachments
 * (e.g., 256KB → 4 frames instead of 64) while staying well within protocol limits.
 */
export const MAX_STREAM_CHUNK_SIZE = 65_536

/** Maximum number of buffered stream frames */
export const MAX_STREAM_BUFFERS = 100

/**
 * Maximum cumulative size (in bytes) buffered for a single stream id.
 * Prevents unbounded memory growth from misbehaving peers.
 * 100 MiB comfortably covers expected activity payloads including attachments.
 */
export const MAX_STREAM_SIZE = 100 * 1024 * 1024

/** Default request timeout in milliseconds (reduced from 60s to speed up relay-failure detection) */
export const REQUEST_TIMEOUT_MS = 20_000

/** Maximum concurrent inbound requests dispatched to application logic. */
export const MAX_INFLIGHT_DISPATCHES = 25

/** Maximum bytes retained across buffered streams and in-flight request bodies. */
export const MAX_BUFFERED_AND_INFLIGHT_BYTES = 256 * 1024 * 1024
