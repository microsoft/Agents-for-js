// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Represents a response sent over the named pipe protocol.
 */
export interface NamedPipeResponse {
  /** HTTP status code */
  statusCode: number
  /** Content type of the primary body stream (defaults to application/json) */
  contentType?: string
  /** Response body (may be null) */
  body: Buffer | null
}

/** Creates a 200 OK response */
export function ok (body?: Buffer | null): NamedPipeResponse {
  return { statusCode: 200, body: body ?? null }
}

/** Creates a 202 Accepted response */
export function accepted (): NamedPipeResponse {
  return { statusCode: 202, body: null }
}

/** Creates a 404 Not Found response */
export function notFound (): NamedPipeResponse {
  return { statusCode: 404, body: null }
}

/** Creates a 500 Internal Server Error response */
export function internalServerError (): NamedPipeResponse {
  return { statusCode: 500, body: null }
}
