// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents a binary attachment stream that travels alongside a request or response.
 */
export interface NamedPipeAttachment {
  /** Wire identifier (GUID) linking this attachment to its PayloadDescription */
  id: string
  /** MIME content type */
  contentType: string
  /** Assembled attachment bytes */
  body: Buffer
}

/**
 * Represents a request received over the named pipe protocol.
 *
 * @remarks
 * **CancelStream behavior:** If the peer sends a CancelStream frame for a stream
 * referenced by this request, the request is silently abandoned — the handler will
 * never be invoked. This follows Bot.Streaming semantics where incoming CancelStream
 * frames are treated as a signal that the peer has given up on the data transfer.
 */
export interface NamedPipeRequest {
  /** Correlation ID for this request */
  id: string
  /** HTTP verb (GET, POST, etc.) */
  verb: string
  /** Request path */
  path: string
  /** Content type of the primary body stream (defaults to application/json) */
  contentType: string
  /** Request body — null when no body stream was declared */
  body: Buffer | null
  /** Additional attachment streams (Streams[1..N] on the wire) */
  attachments: NamedPipeAttachment[]
}
