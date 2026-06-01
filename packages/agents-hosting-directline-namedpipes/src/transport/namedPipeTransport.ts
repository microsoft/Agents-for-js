// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { Socket } from 'node:net'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper.js'

/**
 * Low-level transport wrapping a single pipe stream (node:net Socket).
 * Provides exact-count reads and buffered writes.
 */
export class NamedPipeTransport {
  private _stream: Socket | null

  constructor (stream: Socket) {
    this._stream = stream
  }

  get isConnected (): boolean {
    return this._stream !== null && !this._stream.destroyed && this._stream.writable
  }

  /**
   * Reads exactly `count` bytes from the pipe.
   * Returns false if the connection closed before all bytes were read.
   */
  async readExact (count: number): Promise<{ success: boolean, data: Buffer }> {
    if (count <= 0) {
      // A zero/negative read has nothing to wait for. Returning success with
      // an empty buffer keeps callers that compute `missing = expected - got`
      // safe from hanging when the expected count is already satisfied.
      return { success: true, data: Buffer.alloc(0) }
    }
    if (!this._stream || this._stream.destroyed) {
      return { success: false, data: Buffer.alloc(0) }
    }

    const stream = this._stream
    const chunks: Buffer[] = []
    let remaining = count

    return new Promise((resolve) => {
      const onData = (chunk: Buffer) => {
        if (remaining <= 0) return

        if (chunk.length >= remaining) {
          chunks.push(chunk.subarray(0, remaining))
          const leftover = chunk.subarray(remaining)
          remaining = 0
          stream.removeListener('data', onData)
          stream.removeListener('error', onError)
          stream.removeListener('close', onClose)
          // Push leftover back
          if (leftover.length > 0) {
            stream.unshift(leftover)
          }
          stream.pause()
          resolve({ success: true, data: Buffer.concat(chunks) })
        } else {
          chunks.push(chunk)
          remaining -= chunk.length
        }
      }

      const onError = () => {
        stream.removeListener('data', onData)
        stream.removeListener('close', onClose)
        stream.pause()
        // If we accumulated chunks for a partial frame, the next caller's
        // readExact would start mid-frame. Destroy the stream so callers
        // observe a clean disconnect rather than a corrupted frame stream.
        if (chunks.length > 0) {
          try { stream.destroy() } catch { /* already destroyed */ }
        }
        resolve({ success: false, data: Buffer.alloc(0) })
      }

      const onClose = () => {
        stream.removeListener('data', onData)
        stream.removeListener('error', onError)
        stream.pause()
        // Same rationale as onError: don't leave a half-read frame behind.
        if (chunks.length > 0) {
          try { stream.destroy() } catch { /* already destroyed */ }
        }
        resolve({ success: false, data: Buffer.alloc(0) })
      }

      stream.on('data', onData)
      stream.once('error', onError)
      stream.once('close', onClose)
      stream.resume()
    })
  }

  /**
   * Reads exactly `count` bytes with a timeout. If the timeout expires before
   * all bytes are read, returns whatever was read (partial success).
   * Used for draining trailing stream bytes that may or may not arrive.
   */
  async readExactWithTimeout (count: number, timeoutMs: number): Promise<{ success: boolean, data: Buffer, partial: boolean }> {
    if (count <= 0) {
      // No bytes requested → resolve immediately rather than waiting for the
      // timeout to fire. Reported as a non-partial success with an empty buffer.
      return { success: true, data: Buffer.alloc(0), partial: false }
    }
    if (!this._stream || this._stream.destroyed) {
      return { success: false, data: Buffer.alloc(0), partial: false }
    }

    const stream = this._stream
    const chunks: Buffer[] = []
    let remaining = count
    let timedOut = false

    return new Promise((resolve) => {
      const cleanup = () => {
        stream.removeListener('data', onData)
        stream.removeListener('error', onError)
        stream.removeListener('close', onClose)
        stream.pause()
      }

      const timer = setTimeout(() => {
        timedOut = true
        cleanup()
        const data = chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0)
        resolve({ success: data.length > 0, data, partial: true })
      }, timeoutMs)

      const onData = (chunk: Buffer) => {
        if (remaining <= 0 || timedOut) return

        if (chunk.length >= remaining) {
          chunks.push(chunk.subarray(0, remaining))
          const leftover = chunk.subarray(remaining)
          remaining = 0
          clearTimeout(timer)
          cleanup()
          if (leftover.length > 0) {
            stream.unshift(leftover)
          }
          resolve({ success: true, data: Buffer.concat(chunks), partial: false })
        } else {
          chunks.push(chunk)
          remaining -= chunk.length
        }
      }

      const onError = () => {
        clearTimeout(timer)
        cleanup()
        resolve({ success: false, data: Buffer.alloc(0), partial: false })
      }

      const onClose = () => {
        clearTimeout(timer)
        cleanup()
        resolve({ success: false, data: Buffer.alloc(0), partial: false })
      }

      stream.on('data', onData)
      stream.once('error', onError)
      stream.once('close', onClose)
      stream.resume()
    })
  }

  /**
   * Writes a buffer to the pipe.
   */
  async write (buffer: Buffer): Promise<void> {
    // Mirror `isConnected`: a socket that has been `end()`-ed is no longer writable
    // even though it hasn't been destroyed yet. Treating that as PipeNotConnected
    // (instead of letting Node fire ERR_STREAM_WRITE_AFTER_END → PipeWriteFailed)
    // keeps the failure surface consistent with `isConnected` for callers that
    // pre-check before writing.
    if (!this._stream || this._stream.destroyed || !this._stream.writable) {
      throw ExceptionHelper.generateException(Error, Errors.PipeNotConnected)
    }

    return new Promise((resolve, reject) => {
      this._stream!.write(buffer, (err) => {
        if (err) {
          reject(ExceptionHelper.generateException(Error, Errors.PipeWriteFailed, err, { reason: err.message }))
        } else {
          resolve()
        }
      })
    })
  }

  /**
   * Closes the transport and underlying stream.
   */
  async dispose (): Promise<void> {
    if (this._stream) {
      this._stream.destroy()
      this._stream = null
    }
  }
}
