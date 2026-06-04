// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { createServer, type Server, type Socket } from 'node:net'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { NamedPipeTransport } from './namedPipeTransport.js'
import { debug } from '@microsoft/agents-telemetry'
import { Errors } from '../errorHelper.js'

const logger = debug('agents:named-pipe-connection')
const MAX_PIPE_NAME_LENGTH = 78
const MAX_PIPE_PATH_COMPONENT_LENGTH = MAX_PIPE_NAME_LENGTH + '.incoming'.length
const VALID_PIPE_NAME = /^[A-Za-z0-9._-]+$/

/**
 * Throws if the current process is not running on Windows.
 *
 * Named pipe hosting in this package is Windows-only by design: the wire
 * format and security model are tailored to Win32 named pipes, and the
 * Unix-domain socket equivalent would need a different threat model
 * (peer-uid checks, filesystem permissions, etc.). Surfacing this as a
 * single, explicit failure mode keeps consumers from silently relying on
 * an unsupported configuration on macOS/Linux.
 */
export function assertWindowsPlatform (): void {
  if (process.platform !== 'win32') {
    throw ExceptionHelper.generateException(Error, Errors.PipePlatformNotSupported, undefined, {
      platform: process.platform
    })
  }
}

/**
 * Returns the Windows named pipe path for the given pipe name.
 */
export function getPipePath (pipeName: string): string {
  assertWindowsPlatform()
  validatePipePathComponent(pipeName)
  return `\\\\.\\pipe\\${pipeName}`
}

/**
 * Validates a caller-provided pipe name before any OS path is created.
 */
export function validatePipeName (pipeName: string): void {
  validatePipePathComponent(pipeName, MAX_PIPE_NAME_LENGTH)
}

function validatePipePathComponent (pipeName: string, maxLength = MAX_PIPE_PATH_COMPONENT_LENGTH): void {
  if (typeof pipeName !== 'string') {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, { reason: 'name must be a string' })
  }
  if (pipeName.length === 0) {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, { reason: 'name must not be empty' })
  }
  if (pipeName.length > maxLength) {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, {
      reason: `name must be ${maxLength} characters or fewer`
    })
  }
  if (pipeName !== pipeName.trim()) {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, {
      reason: 'name must not start or end with whitespace'
    })
  }
  if (pipeName.includes('..')) {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, {
      reason: 'name must not contain consecutive dots'
    })
  }
  if (!VALID_PIPE_NAME.test(pipeName)) {
    throw ExceptionHelper.generateException(Error, Errors.PipeNameInvalid, undefined, {
      reason: 'name may contain only letters, numbers, dots, underscores, and hyphens'
    })
  }
}

/**
 * Manages a dual named pipe connection (incoming + outgoing).
 * Creates two net.Server instances that listen on `{pipeName}.incoming`
 * and `{pipeName}.outgoing`.
 *
 * Windows-only: the constructor throws PipePlatformNotSupported on any
 * other platform so misuse fails fast rather than producing confusing
 * socket errors later.
 */
export class NamedPipeConnection {
  private readonly _pipeName: string
  private _incomingServer: Server | null = null
  private _outgoingServer: Server | null = null
  private _reader: NamedPipeTransport | null = null
  private _writer: NamedPipeTransport | null = null

  constructor (pipeName: string) {
    assertWindowsPlatform()
    validatePipeName(pipeName)
    this._pipeName = pipeName
  }

  get reader (): NamedPipeTransport | null {
    return this._reader
  }

  get writer (): NamedPipeTransport | null {
    return this._writer
  }

  get isConnected (): boolean {
    return (this._reader?.isConnected ?? false) && (this._writer?.isConnected ?? false)
  }

  /**
   * Starts listening on both pipes and waits for a client connection on each.
   * Binds sequentially to prevent split-brain scenarios.
   */
  async waitForConnection (cancellationToken?: AbortSignal): Promise<void> {
    try {
      const incomingPath = getPipePath(`${this._pipeName}.incoming`)
      const outgoingPath = getPipePath(`${this._pipeName}.outgoing`)

      logger.info(`Waiting for connection on incoming: ${incomingPath}`)
      const incomingSocket = await this._listen(incomingPath, (server) => { this._incomingServer = server }, cancellationToken)
      this._reader = new NamedPipeTransport(incomingSocket)
      logger.info(`Incoming pipe connected from ${incomingSocket.remoteAddress || 'local'}`)

      incomingSocket.on('close', (hadError) => {
        logger.warn(`Incoming pipe socket closed (hadError=${hadError})`)
      })
      incomingSocket.on('error', (err) => {
        logger.error(`Incoming pipe socket error: ${err.message}`)
      })

      logger.info(`Waiting for connection on outgoing: ${outgoingPath}`)
      const outgoingSocket = await this._listen(outgoingPath, (server) => { this._outgoingServer = server }, cancellationToken)
      this._writer = new NamedPipeTransport(outgoingSocket)
      logger.info(`Outgoing pipe connected from ${outgoingSocket.remoteAddress || 'local'}`)

      outgoingSocket.on('close', (hadError) => {
        logger.warn(`Outgoing pipe socket closed (hadError=${hadError})`)
      })
      outgoingSocket.on('error', (err) => {
        logger.error(`Outgoing pipe socket error: ${err.message}`)
      })

      logger.info('Both pipes connected successfully')
    } catch (err) {
      await this.dispose()
      throw err
    }
  }

  /**
   * Disconnects and cleans up both pipe servers.
   */
  async dispose (): Promise<void> {
    await this._reader?.dispose()
    await this._writer?.dispose()
    this._reader = null
    this._writer = null

    await this._closeServer(this._incomingServer)
    await this._closeServer(this._outgoingServer)
    this._incomingServer = null
    this._outgoingServer = null
  }

  private async _listen (path: string, setServer: (s: Server) => void, cancellationToken?: AbortSignal): Promise<Socket> {
    // Windows named pipes may remain held briefly after the previous
    // process exits (common during Azure App Service restarts). Retry the
    // listen with a short interval rather than failing immediately and
    // going through the full reconnect cycle.
    const maxAttempts = 30
    const retryDelayMs = 250

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (cancellationToken?.aborted) {
        throw ExceptionHelper.generateException(Error, Errors.PipeOperationCancelled)
      }

      try {
        return await this._listenOnce(path, setServer, cancellationToken)
      } catch (err) {
        const isAddrInUse = (err as NodeJS.ErrnoException)?.code === 'EADDRINUSE'
        if (!isAddrInUse || attempt >= maxAttempts) {
          throw err
        }
        if (attempt === 1) {
          logger.info(`Pipe ${path} in use (previous process still releasing); retrying...`)
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelayMs))
      }
    }

    // Unreachable, but satisfies TypeScript
    throw ExceptionHelper.generateException(Error, Errors.PipeConnectionFailed, undefined, {
      reason: `unable to bind ${path} after ${maxAttempts} attempts`
    })
  }

  private _listenOnce (path: string, setServer: (s: Server) => void, cancellationToken?: AbortSignal): Promise<Socket> {
    return new Promise((resolve, reject) => {
      let settled = false
      let onAbort: (() => void) | null = null

      const settle = (callback: () => void) => {
        if (settled) return
        settled = true
        if (onAbort) {
          cancellationToken?.removeEventListener('abort', onAbort)
        }
        callback()
      }

      if (cancellationToken?.aborted) {
        settle(() => reject(ExceptionHelper.generateException(Error, Errors.PipeOperationCancelled)))
        return
      }

      const server = createServer((socket: Socket) => {
        settle(() => resolve(socket))
      })

      setServer(server)

      server.on('error', (err) => {
        settle(() => reject(err))
      })

      onAbort = () => {
        server.close()
        settle(() => reject(ExceptionHelper.generateException(Error, Errors.PipeOperationCancelled)))
      }

      cancellationToken?.addEventListener('abort', onAbort, { once: true })

      server.listen(path, () => {
        logger.debug(`Server listening on ${path}`)
      })
    })
  }

  private _closeServer (server: Server | null): Promise<void> {
    if (!server) return Promise.resolve()
    return new Promise((resolve) => {
      try {
        server.close(() => resolve())
      } catch {
        resolve()
      }
    })
  }
}
