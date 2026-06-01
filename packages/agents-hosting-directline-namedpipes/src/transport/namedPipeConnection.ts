// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { chmod, lstat, unlink } from 'node:fs/promises'
import { connect, createServer, type Server, type Socket } from 'node:net'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { NamedPipeTransport } from './namedPipeTransport.js'
import { debug } from '@microsoft/agents-telemetry'
import { Errors } from '../errorHelper.js'

const logger = debug('agents:named-pipe-connection')
const MAX_PIPE_NAME_LENGTH = 78
const MAX_PIPE_PATH_COMPONENT_LENGTH = MAX_PIPE_NAME_LENGTH + '.incoming'.length
const VALID_PIPE_NAME = /^[A-Za-z0-9._-]+$/
// Intentional one-shot, process-wide flag: the underlying limitation
// (Unix-domain socket peer-uid semantics on non-Linux platforms) is global,
// so repeating the warning per NamedPipeConnection instance would only add
// noise. Reset is therefore not desirable.
let warnedAboutUnixSocketPermissions = false

/**
 * Returns the platform-appropriate pipe/socket path.
 */
export function getPipePath (pipeName: string): string {
  validatePipePathComponent(pipeName)
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${pipeName}`
  }
  return `/tmp/CoreFxPipe_${pipeName}`
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
 * Creates two net.Server instances that listen on `{pipeName}.incoming` and `{pipeName}.outgoing`.
 */
export class NamedPipeConnection {
  private readonly _pipeName: string
  private _incomingServer: Server | null = null
  private _outgoingServer: Server | null = null
  private _reader: NamedPipeTransport | null = null
  private _writer: NamedPipeTransport | null = null

  constructor (pipeName: string) {
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
    await this._prepareSocketPath(path)

    // On Windows, named pipes may remain held briefly after the previous process exits
    // (common during Azure App Service restarts). Retry the listen with a short interval
    // rather than failing immediately and going through the full reconnect cycle.
    const maxAttempts = process.platform === 'win32' ? 30 : 1
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

      this._withRestrictiveSocketUmask(() => {
        server.listen(path, async () => {
          logger.debug(`Server listening on ${path}`)
          try {
            await this._hardenSocketPath(path)
          } catch (err) {
            server.close()
            const error = err instanceof Error
              ? err
              : ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, undefined, {
                reason: String(err)
              })
            settle(() => reject(error))
          }
        })
      })
    })
  }

  private _withRestrictiveSocketUmask (callback: () => void): void {
    if (process.platform === 'win32') {
      callback()
      return
    }
    if (process.platform !== 'linux' && !warnedAboutUnixSocketPermissions) {
      warnedAboutUnixSocketPermissions = true
      logger.warn('Unix-domain socket permissions are platform-dependent; use named pipes only where local users are trusted on this OS')
    }

    const previousUmask = process.umask()
    process.umask(previousUmask | 0o177)
    try {
      callback()
    } finally {
      process.umask(previousUmask)
    }
  }

  private async _prepareSocketPath (path: string): Promise<void> {
    if (process.platform === 'win32') return

    let stat
    try {
      stat = await lstat(path)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      throw ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, err as Error, {
        reason: `unable to inspect ${path}`
      })
    }

    if (!stat.isSocket()) {
      throw ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, undefined, {
        reason: `${path} already exists and is not a socket`
      })
    }

    if (await this._isSocketAcceptingConnections(path)) {
      throw ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, undefined, {
        reason: `${path} is already in use`
      })
    }

    try {
      await unlink(path)
    } catch (err) {
      throw ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, err as Error, {
        reason: `unable to remove stale socket ${path}`
      })
    }
  }

  private async _hardenSocketPath (path: string): Promise<void> {
    if (process.platform === 'win32') return
    try {
      await chmod(path, 0o600)
    } catch (err) {
      throw ExceptionHelper.generateException(Error, Errors.PipeSocketPathUnsafe, err as Error, {
        reason: `unable to restrict permissions on ${path}`
      })
    }
  }

  private _isSocketAcceptingConnections (path: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = connect(path)
      let settled = false
      const timer = setTimeout(() => settle(true), 500)
      const settle = (isAccepting: boolean) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        socket.removeAllListeners()
        socket.destroy()
        resolve(isAccepting)
      }

      socket.once('connect', () => settle(true))
      socket.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNREFUSED' || err.code === 'ENOENT') {
          settle(false)
          return
        }
        settle(true)
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
