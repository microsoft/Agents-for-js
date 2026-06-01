// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { Activity } from '@microsoft/agents-activity'
import { CloudAdapter, TurnContext } from '@microsoft/agents-hosting'
import { debug } from '@microsoft/agents-telemetry'
import type { NamedPipeRequest } from './protocol/namedPipeRequest.js'
import type { NamedPipeResponse } from './protocol/namedPipeResponse.js'
import { internalServerError, notFound } from './protocol/namedPipeResponse.js'

const logger = debug('agents:named-pipe-activity-handler')

/**
 * Handles inbound named pipe requests by deserializing activities
 * and routing them through the CloudAdapter.
 */
export class NamedPipeActivityHandler {
  private readonly _adapter: CloudAdapter
  private readonly _logic: (context: TurnContext) => Promise<void>

  constructor (adapter: CloudAdapter, logic: (context: TurnContext) => Promise<void>) {
    this._adapter = adapter
    this._logic = logic
  }

  /**
   * Handles an inbound request from the named pipe protocol.
   * Routes POST /api/messages to the adapter; returns 404 for anything else.
   */
  async handle (request: NamedPipeRequest, signal?: AbortSignal): Promise<NamedPipeResponse> {
    logger.info(`[ActivityHandler] Received: ${request.verb} ${request.path} (id=${request.id})`)

    if (request.verb === 'POST' && request.path === '/api/messages') {
      return this._processActivity(request, signal)
    }

    logger.warn(`[ActivityHandler] No route for ${request.verb} ${request.path}, returning 404`)
    return notFound()
  }

  private async _processActivity (request: NamedPipeRequest, signal?: AbortSignal): Promise<NamedPipeResponse> {
    if (!request.body) {
      logger.warn('[ActivityHandler] Missing request body')
      return { statusCode: 400, body: Buffer.from(JSON.stringify({ error: 'Missing request body' })) }
    }

    // Reject non-JSON content types with 415
    if (request.contentType && !this._isJsonContentType(request.contentType)) {
      logger.warn(`[ActivityHandler] Unsupported content type '${request.contentType}'`)
      return { statusCode: 415, body: null }
    }

    // Parse + validate caller input separately so malformed bodies surface as
    // 400 Bad Request rather than 500 Internal Server Error (the server is
    // healthy; the inbound payload is the problem).
    let activity: Activity
    try {
      const bodyStr = request.body.toString('utf8')
      logger.info(`[ActivityHandler] Parsing activity body (${bodyStr.length} chars)`)
      logger.debug(`[ActivityHandler] Body: ${bodyStr.substring(0, 1000)}`)
      const activityJson = JSON.parse(bodyStr)
      activity = Activity.fromObject(activityJson)
    } catch (err) {
      logger.warn(`[ActivityHandler] Invalid activity body: ${err}`)
      return {
        statusCode: 400,
        body: Buffer.from(JSON.stringify({ error: 'Invalid activity body', detail: (err as Error)?.message }))
      }
    }

    try {
      logger.info(`[ActivityHandler] Activity parsed: type=${activity.type} id=${activity.id} from=${activity.from?.name || activity.from?.id}`)

      // Surface multi-stream attachments (Streams[1..N]) onto Activity.Attachments
      if (request.attachments && request.attachments.length > 0) {
        const merged = activity.attachments ? [...activity.attachments] : []
        for (const pipeAttachment of request.attachments) {
          merged.push({
            contentType: pipeAttachment.contentType || 'application/octet-stream',
            content: pipeAttachment.body ?? Buffer.alloc(0)
          })
        }
        activity.attachments = merged
        logger.debug(`[ActivityHandler] Merged ${request.attachments.length} pipe attachments`)
      }

      const syntheticReq = {
        body: activity,
        headers: {} as Record<string, string | string[] | undefined>,
        user: { aud: this._getClientId() }
      }

      const syntheticRes = {
        writableEnded: false,
        headersSent: false,
        _status: 200,
        _body: undefined as unknown,
        status (code: number) { this._status = code; return this },
        setHeader () { return this },
        send (body: unknown) { this._body = body; return this },
        end () { this.writableEnded = true }
      }

      logger.info('[ActivityHandler] Calling adapter.process()...')
      const processStart = Date.now()

      await this._adapter.process(
        syntheticReq as any,
        syntheticRes as any,
        this._logic
      )

      const processElapsed = Date.now() - processStart
      const responseStatus = syntheticRes._status
      const responseBody = syntheticRes._body

      logger.info(`[ActivityHandler] adapter.process() completed in ${processElapsed}ms — status=${responseStatus}`)
      if (responseBody) {
        logger.debug(`[ActivityHandler] Response body: ${JSON.stringify(responseBody).substring(0, 500)}`)
      }

      const body = responseBody
        ? Buffer.from(JSON.stringify(responseBody), 'utf8')
        : null

      return { statusCode: responseStatus, body }
    } catch (err) {
      logger.error(`[ActivityHandler] Error processing activity: ${err}`)
      logger.error(`[ActivityHandler] Stack: ${(err as Error)?.stack}`)
      return internalServerError()
    }
  }

  /**
   * Safely retrieves the clientId from the adapter's connection manager.
   * Returns empty string for local named-pipe mode so the adapter takes the
   * anonymous connector-client path (no token acquisition).
   */
  private _getClientId (): string {
    try {
      const clientId = this._adapter.connectionManager?.getDefaultConnection()?.connectionSettings?.clientId ?? ''
      // 'local-named-pipe' is the sentinel used by createLocalAdapter() — treat it as anonymous
      if (clientId === 'local-named-pipe') return ''
      return clientId
    } catch {
      // No connections configured — named pipes don't require auth
      return ''
    }
  }

  /** Returns true when the value parses as a JSON media type. */
  private _isJsonContentType (contentType: string): boolean {
    const mediaType = contentType.split(';')[0].trim().toLowerCase()
    return mediaType === 'application/json'
  }
}
