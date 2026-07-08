// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity, ExceptionHelper } from '@microsoft/agents-activity'
import type { ConversationReference } from '@microsoft/agents-activity'
import { CloudAdapter, ConnectorClient, HeaderPropagationCollection, INVOKE_RESPONSE_KEY, ResourceResponse, TurnContext } from '@microsoft/agents-hosting'
import { debug, trace } from '@microsoft/agents-telemetry'
import { JwtPayload } from 'jsonwebtoken'
import type { NamedPipeMessageHandler } from './namedPipeMessageHandler.js'
import { NamedPipeTraceDefinitions } from './observability/traces.js'
import { Errors } from './errorHelper.js'

const logger = debug('agents:named-pipe-local-adapter')

const PIPE_URL_PREFIX = 'urn:botframework:namedpipe:'

/**
 * A CloudAdapter subclass that routes outbound activity sends through
 * the named pipe protocol instead of making HTTP requests.
 *
 * Named pipes are local IPC — the OS filesystem permissions protect the pipe,
 * so no Azure/Entra credentials are needed.
 */
class LocalPipeAdapter extends CloudAdapter {
  private _messageHandler: NamedPipeMessageHandler | null = null
  private _pendingSends = 0
  private _sendQueue: Array<() => void> = []

  /** Maximum concurrent fire-and-forget outbound sends */
  private static readonly MAX_CONCURRENT_SENDS = 10
  /** Maximum queued sends waiting for a slot */
  private static readonly MAX_QUEUED_SENDS = 100
  /**
   * Timeout for outbound activity sends (bot → relay → client).
   * Shorter than the protocol-level REQUEST_TIMEOUT_MS (20s) to prevent
   * one dead client from holding send slots and blocking all other conversations.
   */
  private static readonly OUTBOUND_SEND_TIMEOUT_MS = 15_000

  constructor () {
    // Use a sentinel clientId so the base class doesn't reject us in production,
    // but we'll never actually use it to acquire tokens.
    super({ clientId: 'local-named-pipe', tenantId: 'local' })
  }

  /** Wire the message handler so outbound calls route through the pipe. */
  setMessageHandler (handler: NamedPipeMessageHandler | null): void {
    this._messageHandler = handler
  }

  /**
   * Override: for pipe serviceUrls, skip token acquisition entirely.
   * Returns a no-op ConnectorClient that won't be used (sendActivities is also overridden).
   */
  protected override async createConnectorClientWithIdentity (
    identity: JwtPayload,
    activity: Activity,
    headers?: HeaderPropagationCollection
  ): Promise<ConnectorClient> {
    const serviceUrl = activity?.serviceUrl || ''
    if (serviceUrl.startsWith(PIPE_URL_PREFIX)) {
      logger.debug('createConnectorClientWithIdentity: pipe URL detected, skipping token acquisition')
      // Return a dummy client — sendActivities override handles all outbound pipe traffic
      return ConnectorClient.createClientWithToken(serviceUrl, '')
    }
    return super.createConnectorClientWithIdentity(identity, activity, headers)
  }

  /**
   * Override: for pipe serviceUrls, send activities directly through the named pipe
   * protocol without creating a ConnectorClient or acquiring tokens.
   *
   * IMPORTANT: Outbound sends are fire-and-forget to avoid deadlock.
   * The named pipe protocol is full-duplex, but DirectLineFlex may not process
   * outbound requests until it receives the inbound response. Since adapter.process()
   * awaits onTurn (which calls sendActivity), awaiting the pipe response would deadlock.
   */
  override async sendActivities (context: TurnContext, activities: Activity[]): Promise<ResourceResponse[]> {
    if (!activities || activities.length === 0) {
      return super.sendActivities(context, activities)
    }

    // Check if the first activity targets a pipe URL
    const serviceUrl = activities[0]?.serviceUrl || context.activity?.serviceUrl || ''
    if (!serviceUrl.startsWith(PIPE_URL_PREFIX) || !this._messageHandler) {
      logger.debug(`sendActivities: delegating to super (serviceUrl=${serviceUrl}, hasHandler=${!!this._messageHandler})`)
      return super.sendActivities(context, activities)
    }

    const inboundActivityId = context.activity?.id || '(unknown)'
    const inboundActivityType = context.activity?.type || '(unknown)'
    logger.info(`[sendActivities] Sending ${activities.length} activities via pipe` +
      ` (in response to inbound ${inboundActivityType} id=${inboundActivityId})` +
      ` | pendingSends=${this._pendingSends} queueLen=${this._sendQueue.length}`)

    const sendableCount = activities.filter(activity => LocalPipeAdapter._willSendViaPipe(activity)).length
    const sendCapacity = LocalPipeAdapter.MAX_CONCURRENT_SENDS + LocalPipeAdapter.MAX_QUEUED_SENDS
    const queuedSends = this._pendingSends + this._sendQueue.length
    if (sendableCount > sendCapacity - queuedSends) {
      throw ExceptionHelper.generateException(Error, Errors.PipeSendQueueFull, undefined, {
        queued: String(queuedSends),
        limit: String(sendCapacity)
      })
    }

    const responses: ResourceResponse[] = []
    for (let i = 0; i < activities.length; i++) {
      const activity = activities[i]
      // Skip traces on non-emulator channels
      if (activity.type === 'trace' && activity.channelId !== 'emulator') {
        logger.debug(`[sendActivities] [${i}] Skipping trace activity`)
        responses.push({ id: activity.id ?? '' })
        continue
      }

      // InvokeResponse is handled via turnState, not sent outbound.
      // Use the same key CloudAdapter.processTurnResults reads from
      // (INVOKE_RESPONSE_KEY is a module-local Symbol, NOT Symbol.for).
      if (activity.type === 'invokeResponse') {
        logger.debug(`[sendActivities] [${i}] Storing invokeResponse in turnState`)
        context.turnState.set(INVOKE_RESPONSE_KEY, activity)
        responses.push({ id: activity.id ?? '' })
        continue
      }

      delete activity.id

      const conversationId = activity.conversation?.id
      if (!conversationId) {
        logger.warn(`[sendActivities] [${i}] Missing conversation.id, skipping`)
        responses.push({ id: '' })
        continue
      }

      const path = activity.replyToId
        ? `${PIPE_URL_PREFIX}v3/conversations/${conversationId}/activities/${activity.replyToId}`
        : `${PIPE_URL_PREFIX}v3/conversations/${conversationId}/activities`

      const body = Buffer.from(JSON.stringify(activity), 'utf8')

      logger.info(`[sendActivities] [${i}] Fire-and-forget POST ${path} (${body.length} bytes, type=${activity.type})`)

      // Fire-and-forget with backpressure: cap concurrent outbound sends to avoid
      // resource exhaustion when the agent emits many activities rapidly.
      //
      // IMPORTANT: We use setImmediate to defer outbound writes so that the current
      // handler can return first. This ensures the inbound response (B frame / ACK)
      // is queued on _writePromise BEFORE outbound activity frames. Without this,
      // under fast load the write queue fills with outbound A+S frames, delaying the
      // inbound B response. The DL Flex relay waits for B before processing outbound
      // requests — creating a deadlock where both sides block on each other.
      const messageHandler = this._messageHandler
      const sendTimestamp = Date.now()
      const doSend = () => {
        const sendTrace = trace(NamedPipeTraceDefinitions.send)
        sendTrace.record({ bodySize: body.length })

        // Race the actual send against a shorter timeout to prevent one dead
        // client's conversation from holding a concurrent send slot for the
        // full protocol timeout (20s). If the relay can't forward within 15s,
        // the client is likely disconnected — free the slot for other conversations.
        const sendPromise = messageHandler.sendViaPipe('POST', path, body, null, 'application/json')
        let sendTimer: ReturnType<typeof setTimeout> | undefined
        const timeoutPromise = new Promise<never>((_resolve, reject) => {
          sendTimer = setTimeout(() => {
            reject(ExceptionHelper.generateException(Error, Errors.PipeOutboundSendTimeout, undefined, {
              timeout: String(LocalPipeAdapter.OUTBOUND_SEND_TIMEOUT_MS)
            }))
          }, LocalPipeAdapter.OUTBOUND_SEND_TIMEOUT_MS)
        })

        Promise.race([sendPromise, timeoutPromise])
          .then((pipeResponse) => {
            const elapsed = Date.now() - sendTimestamp
            logger.info(`[sendActivities] [${i}] Pipe response received: status=${pipeResponse.statusCode} elapsed=${elapsed}ms bodyLen=${pipeResponse.body?.length ?? 0}`)
            if (pipeResponse.body) {
              logger.debug(`[sendActivities] [${i}] Response body: ${pipeResponse.body.toString('utf8').substring(0, 200)}`)
            }
            sendTrace.record({ statusCode: pipeResponse.statusCode })
            sendTrace.end()
          })
          .catch((err: any) => {
            const elapsed = Date.now() - sendTimestamp
            logger.error(`[sendActivities] [${i}] Pipe send FAILED after ${elapsed}ms: ${err.message}` +
              ` | pendingSends=${this._pendingSends} queueLen=${this._sendQueue.length}` +
              ` | conversationId=${activity.conversation?.id} replyToId=${activity.replyToId ?? 'none'}`)
            sendTrace.fail(err)
            sendTrace.end()
          })
          .finally(() => {
            clearTimeout(sendTimer)
            // Hand the slot off to the next queued send (no net change in
            // _pendingSends), or release it if the queue is empty.
            const next = this._sendQueue.shift()
            if (next) {
              setImmediate(next)
            } else {
              this._pendingSends--
            }
          })
      }

      // Reserve the concurrency slot synchronously so that many activities
      // scheduled in the same tick observe accurate _pendingSends and either
      // run, queue, or fail-fast at the documented limits.
      if (this._pendingSends < LocalPipeAdapter.MAX_CONCURRENT_SENDS) {
        this._pendingSends++
        setImmediate(doSend)
      } else if (this._sendQueue.length < LocalPipeAdapter.MAX_QUEUED_SENDS) {
        this._sendQueue.push(doSend)
      } else {
        throw ExceptionHelper.generateException(Error, Errors.PipeSendQueueFull, undefined, {
          queued: String(this._pendingSends + this._sendQueue.length),
          limit: String(LocalPipeAdapter.MAX_CONCURRENT_SENDS + LocalPipeAdapter.MAX_QUEUED_SENDS)
        })
      }

      responses.push({ id: '' })
    }

    logger.debug(`[sendActivities] Returning ${responses.length} responses (all fire-and-forget, not awaited)`)
    return responses
  }

  private static _willSendViaPipe (activity: Activity): boolean {
    if (activity.type === 'trace' && activity.channelId !== 'emulator') return false
    if (activity.type === 'invokeResponse') return false
    return !!activity.conversation?.id
  }

  /**
   * Override: for pipe serviceUrls, route activity updates through the named
   * pipe protocol (`PUT /v3/conversations/{conversationId}/activities/{activityId}`).
   * For non-pipe serviceUrls, delegate to the base CloudAdapter implementation,
   * which uses ConnectorClient over HTTP.
   *
   * Without this override the base implementation would try to use the
   * ConnectorClient against a `urn:botframework:namedpipe:` baseURL
   * and fail with a confusing "Invalid URL" / `ECONNREFUSED`.
   */
  override async updateActivity (context: TurnContext, activity: Activity): Promise<ResourceResponse | void> {
    const serviceUrl = activity?.serviceUrl ?? ''
    if (!serviceUrl.startsWith(PIPE_URL_PREFIX) || !this._messageHandler) {
      return super.updateActivity(context, activity)
    }

    if (!activity.conversation?.id || !activity.id) {
      throw ExceptionHelper.generateException(Error, Errors.PipeProtocolError, undefined, {
        reason: 'updateActivity requires activity.id and activity.conversation.id'
      })
    }

    const path = `${PIPE_URL_PREFIX}v3/conversations/${activity.conversation.id}/activities/${activity.id}`
    const body = Buffer.from(JSON.stringify(activity), 'utf8')
    logger.info(`[updateActivity] PUT ${path} (${body.length} bytes)`)

    const pipeResponse = await this._messageHandler.sendViaPipe('PUT', path, body, null, 'application/json')
    if (pipeResponse.body && pipeResponse.body.length > 0) {
      try {
        const parsed = JSON.parse(pipeResponse.body.toString('utf8')) as { id?: string }
        if (parsed.id) return { id: parsed.id }
      } catch {
        // Non-JSON response body; treat as no resource id.
      }
    }
    return undefined
  }

  /**
   * Override: for pipe serviceUrls, route activity deletes through the named
   * pipe protocol (`DELETE /v3/conversations/{conversationId}/activities/{activityId}`).
   * For non-pipe serviceUrls, delegate to the base CloudAdapter implementation.
   *
   * See {@link updateActivity} for the rationale.
   */
  override async deleteActivity (context: TurnContext, reference: Partial<ConversationReference>): Promise<void> {
    const serviceUrl = reference?.serviceUrl ?? ''
    if (!serviceUrl.startsWith(PIPE_URL_PREFIX) || !this._messageHandler) {
      return super.deleteActivity(context, reference)
    }

    if (!reference.conversation?.id || !reference.activityId) {
      throw ExceptionHelper.generateException(Error, Errors.PipeProtocolError, undefined, {
        reason: 'deleteActivity requires reference.activityId and reference.conversation.id'
      })
    }

    const path = `${PIPE_URL_PREFIX}v3/conversations/${reference.conversation.id}/activities/${reference.activityId}`
    logger.info(`[deleteActivity] DELETE ${path}`)
    await this._messageHandler.sendViaPipe('DELETE', path, null, null, null)
  }
}

/**
 * Creates a CloudAdapter configured for local named-pipe communication
 * without requiring authentication credentials.
 *
 * Named pipes are local IPC — the OS filesystem permissions protect the pipe,
 * so no Azure/Entra credentials are needed. This factory bypasses the
 * "ClientId required in production" check that `new CloudAdapter()` enforces
 * when `NODE_ENV=production` and no credentials are configured.
 *
 * @returns A LocalPipeAdapter suitable for named-pipe use regardless of NODE_ENV.
 *
 * @example
 * ```typescript
 * import { createLocalAdapter, startNamedPipeServer } from '@microsoft/agents-hosting-directline-namedpipes'
 *
 * const adapter = createLocalAdapter()
 * const service = await startNamedPipeServer(adapter, (context) => agent.run(context))
 * ```
 */
export function createLocalAdapter (): LocalPipeAdapter {
  return new LocalPipeAdapter()
}

export type { LocalPipeAdapter }
