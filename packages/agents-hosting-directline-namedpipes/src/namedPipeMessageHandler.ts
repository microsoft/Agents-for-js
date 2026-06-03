// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { debug } from '@microsoft/agents-telemetry'
import type { NamedPipeProtocol } from './protocol/namedPipeProtocol.js'
import type { NamedPipeResponse } from './protocol/namedPipeResponse.js'
import type { NamedPipeAttachment } from './protocol/namedPipeRequest.js'

const logger = debug('agents:named-pipe-message-handler')

const PIPE_URL_PREFIX = 'urn:botframework:namedpipe:'

/**
 * Intercepts outbound HTTP requests targeting named pipe URLs
 * and routes them through the named pipe protocol instead.
 */
export class NamedPipeMessageHandler {
  private _protocol: NamedPipeProtocol | null = null

  /** Sets the protocol instance to route requests through. */
  setProtocol (protocol: NamedPipeProtocol | null): void {
    this._protocol = protocol
  }

  /**
   * Returns true if the given URL should be routed through the named pipe.
   */
  shouldHandle (url: string): boolean {
    return url.startsWith(PIPE_URL_PREFIX)
  }

  /**
   * Sends an HTTP-like request over the named pipe protocol.
   * The URL is translated from `urn:botframework:namedpipe:{path}` to `/{path}`.
   */
  async sendViaPipe (
    verb: string,
    url: string,
    body?: Buffer | null,
    attachments?: NamedPipeAttachment[] | null,
    contentType?: string | null
  ): Promise<NamedPipeResponse> {
    if (!this._protocol) {
      logger.warn('No protocol set, cannot send via pipe')
      return { statusCode: 503, body: null }
    }

    // Extract /v3/... path from the urn: URI
    const fullUri = url
    const pathStart = fullUri.indexOf('/v3/')
    if (pathStart < 0) {
      const path = '/' + url.slice(PIPE_URL_PREFIX.length)
      logger.debug(`Routing ${verb} ${path} via pipe`)
      return this._protocol.sendRequest(verb, path, body ?? null, attachments, contentType)
    }

    const path = fullUri.slice(pathStart)
    logger.debug(`Routing ${verb} ${path} via pipe (BodyLen=${body?.length ?? 0}, Attachments=${attachments?.length ?? 0})`)
    return this._protocol.sendRequest(verb, path, body ?? null, attachments, contentType)
  }
}
