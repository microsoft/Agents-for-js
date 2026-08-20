// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { CloudAdapter, TurnContext } from '@microsoft/agents-hosting'
import { ExceptionHelper } from '@microsoft/agents-activity'
import { debug, trace } from '@microsoft/agents-telemetry'
import { assertWindowsPlatform, NamedPipeConnection, validatePipeName } from './transport/namedPipeConnection.js'
import { NamedPipeProtocol } from './protocol/namedPipeProtocol.js'
import { NamedPipeActivityHandler } from './namedPipeActivityHandler.js'
import { NamedPipeMessageHandler } from './namedPipeMessageHandler.js'
import { NamedPipeTraceDefinitions } from './observability/traces.js'
import type { LocalPipeAdapter } from './createLocalAdapter.js'
import { Errors } from './errorHelper.js'

const logger = debug('agents:named-pipe-server')

/**
 * Options for configuring the named pipe server.
 */
export interface NamedPipeServerOptions {
  /** Pipe name. Defaults to `'bfv4.pipes'`. */
  pipeName?: string
  /** Whether to automatically reconnect on disconnect. Defaults to `true`. */
  autoReconnect?: boolean
}

/**
 * Manages the named pipe server lifecycle: connect, listen, reconnect.
 */
export class NamedPipeService {
  private readonly _adapter: CloudAdapter
  private readonly _logic: (context: TurnContext) => Promise<void>
  private readonly _pipeName: string
  private readonly _autoReconnect: boolean
  private _connection: NamedPipeConnection | null = null
  private _protocol: NamedPipeProtocol | null = null
  private _activityHandler: NamedPipeActivityHandler
  private _messageHandler: NamedPipeMessageHandler
  private _running = false
  private _abortController: AbortController | null = null
  private _readyResolve: (() => void) | null = null
  private _readyReject: ((err: Error) => void) | null = null
  private _ready: Promise<void>

  /**
   * Resolves when the first connection is established in the current start cycle.
   * Rejects if `stop()` is called before a connection succeeds.
   * Resets on each `start()` call.
   */
  get ready (): Promise<void> {
    return this._ready
  }

  constructor (
    adapter: CloudAdapter,
    logic: (context: TurnContext) => Promise<void>,
    options?: NamedPipeServerOptions
  ) {
    this._adapter = adapter
    this._logic = logic
    this._pipeName = options?.pipeName ?? 'bfv4.pipes'
    validatePipeName(this._pipeName)
    this._autoReconnect = options?.autoReconnect ?? true
    this._activityHandler = new NamedPipeActivityHandler(adapter, logic)
    this._messageHandler = new NamedPipeMessageHandler()

    this._ready = this._createReadyPromise()

    // Wire the message handler into the adapter so outbound sends route through the pipe
    if (typeof (adapter as LocalPipeAdapter).setMessageHandler === 'function') {
      (adapter as LocalPipeAdapter).setMessageHandler(this._messageHandler)
    }
  }

  /** Whether the pipe is currently connected. */
  get isConnected (): boolean {
    return this._connection?.isConnected ?? false
  }

  /** The message handler for routing outbound requests. */
  get messageHandler (): NamedPipeMessageHandler {
    return this._messageHandler
  }

  /**
   * Starts the named pipe server. Listens for connections and processes requests.
   * If autoReconnect is enabled, reconnects on disconnect.
   */
  async start (): Promise<void> {
    if (this._running) return
    try {
      assertWindowsPlatform()
    } catch (err) {
      // Reject the CURRENT ready promise (which may already be held by an external
      // awaiter via `service.ready`) so it unblocks with the platform error instead
      // of hanging forever. Do NOT swap in a new promise first — that would re-target
      // the resolver/rejecter to a fresh promise nobody is awaiting and orphan P1.
      this._rejectReady(this._toError(err))
      throw err
    }
    this._running = true
    this._abortController = new AbortController()

    // Reset ready promise for this start cycle (success path)
    this._ready = this._createReadyPromise()

    logger.info(`Starting named pipe server on '${this._pipeName}'`)
    try {
      await this._connectLoop()
    } catch (err) {
      // Propagate any fatal startup error to awaiters of `ready` so they don't hang.
      this._rejectReady(this._toError(err))
      throw err
    }
  }

  /**
   * Stops the named pipe server and disconnects.
   */
  async stop (): Promise<void> {
    this._running = false
    this._abortController?.abort()
    this._abortController = null
    await this._disconnect()

    this._rejectReady(ExceptionHelper.generateException(Error, Errors.PipeServerStoppedBeforeConnecting))

    logger.info('Named pipe server stopped')
  }

  private async _connectLoop (): Promise<void> {
    while (this._running) {
      try {
        await this._connect()

        // Wait for the protocol to complete (disconnection)
        if (this._protocol) {
          await this._protocol.completion
        }
      } catch (err) {
        logger.error(`Connection error: ${err}`)
        if (this._running && !this._autoReconnect) {
          this._rejectReady(this._toError(err))
        }
      }

      await this._disconnect()

      if (!this._running || !this._autoReconnect) break

      logger.info('Reconnecting in 1s...')
      await this._delay(1000)
    }
  }

  private async _connect (): Promise<void> {
    return trace(NamedPipeTraceDefinitions.connect, async ({ record }) => {
      record({ pipeName: this._pipeName })

      this._connection = new NamedPipeConnection(this._pipeName)
      await this._connection.waitForConnection(this._abortController?.signal)

      const reader = this._connection.reader!
      const writer = this._connection.writer!

      this._protocol = new NamedPipeProtocol(reader, writer)
      this._protocol.onRequestReceived = (request, signal) => this._activityHandler.handle(request, signal)

      // Start the read loop before publishing to outbound callers
      this._protocol.start()
      this._messageHandler.setProtocol(this._protocol)

      // Signal ready on first successful connection
      this._resolveReady()

      logger.info('Named pipe connected and protocol started')
    })
  }

  private async _disconnect (): Promise<void> {
    this._messageHandler.setProtocol(null)
    await this._protocol?.dispose()
    await this._connection?.dispose()
    this._protocol = null
    this._connection = null
  }

  private _delay (ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }

  private _createReadyPromise (): Promise<void> {
    const ready = new Promise<void>((resolve, reject) => {
      this._readyResolve = resolve
      this._readyReject = reject
    })

    // `ready` is an internally managed promise that may reject before callers
    // choose to await it. Mark it handled here so a rejected readiness state
    // does not surface as an unhandled rejection when callers only await
    // `start()`.
    ready.catch(() => {})

    return ready
  }

  private _resolveReady (): void {
    if (!this._readyResolve) return
    this._readyResolve()
    this._readyResolve = null
    this._readyReject = null
  }

  private _rejectReady (err: Error): void {
    if (!this._readyReject) return
    this._readyReject(err)
    this._readyResolve = null
    this._readyReject = null
  }

  private _toError (err: unknown): Error {
    if (err instanceof Error) return err
    return ExceptionHelper.generateException(Error, Errors.PipeConnectionFailed, undefined, {
      reason: String(err)
    })
  }
}

/**
 * Creates and starts a named pipe server for handling agent requests via DirectLine.
 *
 * Returns immediately without waiting for the first connection. Use `service.ready`
 * to await connection readiness, or check `service.isConnected` to poll.
 *
 * @param adapter - The CloudAdapter (or LocalPipeAdapter from `createLocalAdapter()`) to process activities.
 * @param logic - The agent logic function to run on each turn.
 * @param options - Optional configuration for the pipe server.
 * @returns The NamedPipeService instance (connection in progress).
 *
 * @example
 * ```typescript
 * import { createLocalAdapter, startNamedPipeServer } from '@microsoft/agents-hosting-directline-namedpipes'
 *
 * const adapter = createLocalAdapter()
 * const service = await startNamedPipeServer(adapter, (context) => agent.run(context))
 * await service.ready // wait for first connection
 * ```
 */
export async function startNamedPipeServer (
  adapter: CloudAdapter,
  logic: (context: TurnContext) => Promise<void>,
  options?: NamedPipeServerOptions
): Promise<NamedPipeService> {
  // Fail fast on unsupported platforms so callers get a synchronous error
  // matching the README's "throws PipePlatformNotSupported at startup" contract,
  // rather than a service whose `ready` promise silently rejects later.
  assertWindowsPlatform()
  const service = new NamedPipeService(adapter, logic, options)
  // Start without awaiting the connect loop (it runs in background).
  // `service.start()` rejects `service.ready` on failure, so callers awaiting
  // `ready` will observe the underlying error instead of hanging.
  service.start().catch((err) => {
    logger.error(`Named pipe server start failed: ${err}`)
  })
  return service
}
