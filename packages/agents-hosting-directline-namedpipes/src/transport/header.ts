// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper.js'

/**
 * 48-byte ASCII wire frame header for the Bot Framework named pipe protocol.
 * Format: {Type}.{Length:6}.{Id:36}.{End}\n
 */
export interface Header {
  /** Frame type: 'A'=request, 'B'=response, 'S'=stream, 'X'=cancelAll, 'C'=cancelStream */
  type: string
  /** Length of the payload following this header (max 999999) */
  payloadLength: number
  /** UUID identifying the request/response/stream correlation */
  id: string
  /** Whether this is the final frame for this id */
  end: boolean
}

/** Total header size in bytes */
export const HEADER_SIZE = 48

/** Valid frame type characters */
const VALID_TYPES = new Set(['A', 'B', 'S', 'X', 'C'])

/** Header type constants */
export const HeaderTypes = {
  Request: 'A',
  Response: 'B',
  Stream: 'S',
  CancelAll: 'X',
  CancelStream: 'C'
} as const

/**
 * Serializes a Header into a 48-byte ASCII Buffer.
 *
 * Layout: {Type}.{Length:6}.{Id:36}.{End}\n
 * Example: A.001024.12345678-1234-1234-1234-123456789abc.1\n
 */
export function serializeHeader (header: Header): Buffer {
  if (!VALID_TYPES.has(header.type)) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `invalid type '${header.type}', must be one of A, B, S, X, C`
    })
  }
  if (!Number.isInteger(header.payloadLength) || header.payloadLength < 0 || header.payloadLength > 999_999) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `payloadLength ${header.payloadLength} out of range [0, 999999] or not an integer`
    })
  }
  if (!header.id || header.id.length === 0) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: 'id must not be empty'
    })
  }

  const lengthStr = header.payloadLength.toString().padStart(6, '0')
  const idStr = header.id.padEnd(36, ' ').slice(0, 36)
  const endChar = header.end ? '1' : '0'
  const line = `${header.type}.${lengthStr}.${idStr}.${endChar}\n`
  return Buffer.from(line, 'ascii')
}

/**
 * Deserializes a 48-byte ASCII Buffer into a Header.
 */
export function deserializeHeader (buffer: Buffer): Header {
  if (buffer.length < HEADER_SIZE) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `buffer too small: expected ${HEADER_SIZE} bytes, got ${buffer.length}`
    })
  }

  const line = buffer.toString('ascii', 0, HEADER_SIZE)

  // Validate delimiters: dots at positions 1, 8, 45 and newline at 47
  if (line[1] !== '.' || line[8] !== '.' || line[45] !== '.') {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: 'missing expected delimiters at positions 1, 8, and 45'
    })
  }
  if (line[47] !== '\n') {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `expected newline at position 47, got '${line[47]}'`
    })
  }

  const type = line[0]
  if (!VALID_TYPES.has(type)) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `unknown frame type '${type}'`
    })
  }

  const lengthStr = line.slice(2, 8)
  if (!/^\d{6}$/.test(lengthStr)) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `invalid payload length field: '${lengthStr}' (must be exactly 6 digits)`
    })
  }
  const payloadLength = Number(lengthStr)
  if (payloadLength > 999_999) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `payload length ${payloadLength} exceeds maximum 999999`
    })
  }

  const id = line.slice(9, 45).trim()
  if (id.length === 0) {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: 'id field is empty'
    })
  }

  const endChar = line[46]
  if (endChar !== '0' && endChar !== '1') {
    throw ExceptionHelper.generateException(Error, Errors.PipeHeaderInvalid, undefined, {
      reason: `invalid end flag '${endChar}', must be '0' or '1'`
    })
  }
  const end = endChar === '1'

  return { type, payloadLength, id, end }
}
