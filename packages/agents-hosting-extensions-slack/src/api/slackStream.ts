// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { debug } from '@microsoft/agents-telemetry'
import type { SlackApi } from './slackApi.js'
import { markdown, type Chunk } from './chunk.js'

const logger = debug('agents:slack:stream')

/**
 * Options for configuring a {@link SlackStream} instance.
 */
export interface SlackStreamOptions {
  /** Slack user ID of the recipient. Required for channel messages; not needed for DMs. */
  recipientUserId?: string
  /** Slack team ID of the recipient. Required for channel messages; not needed for DMs. */
  recipientTeamId?: string
  /** Controls how agentic task updates are displayed. Defaults to `'timeline'`. */
  taskDisplayMode?: 'timeline' | 'plan'
}

function normalizeContent (content: string | Chunk | Chunk[]): Chunk[] {
  if (typeof content === 'string') return [markdown(content)]
  if (Array.isArray(content)) return content
  return [content]
}

/**
 * Manages the three-phase Slack streaming lifecycle: `start` → `append` → `stop`.
 *
 * @remarks
 * Maps to the Slack API methods `chat.startStream`, `chat.appendStream`, and `chat.stopStream`.
 * Obtain an instance via {@link SlackAgentExtension.createStream} rather than constructing directly.
 *
 * Calling `append()` or `stop()` before `start()` is safe and has no effect.
 */
export class SlackStream {
  private readonly _api: SlackApi
  private readonly _channel: string
  private readonly _threadTs: string
  private readonly _options: SlackStreamOptions | undefined
  private _messageTs: string | undefined

  /**
   * @param {SlackApi} api - Slack API client to use for streaming calls.
   * @param {string} channel - Channel ID to stream into.
   * @param {string} threadTs - Thread timestamp identifying the thread to stream into.
   * @param {SlackStreamOptions} [options] - Optional recipient and display mode settings.
   */
  constructor (api: SlackApi, channel: string, threadTs: string, options?: SlackStreamOptions) {
    this._api = api
    this._channel = channel
    this._threadTs = threadTs
    this._options = options
  }

  /**
   * Starts the stream by calling `chat.startStream`. Must be called before `append()` or `stop()`.
   * @param {Chunk[]} [initialChunks] - Optional chunks to include in the opening payload.
   * @returns {Promise<this>} The stream instance, for chaining.
   */
  async start (initialChunks?: Chunk[]): Promise<this> {
    const body: Record<string, unknown> = {
      channel: this._channel,
      thread_ts: this._threadTs,
    }
    if (this._options?.recipientUserId) body.recipient_user_id = this._options.recipientUserId
    if (this._options?.recipientTeamId) body.recipient_team_id = this._options.recipientTeamId
    if (this._options?.taskDisplayMode) body.task_display_mode = this._options.taskDisplayMode
    if (initialChunks?.length) body.chunks = initialChunks

    const response = await this._api.call('chat.startStream', body)
    this._messageTs = response.ts
    return this
  }

  /**
   * Appends content to the running stream by calling `chat.appendStream`.
   * A plain string is automatically wrapped as a {@link MarkdownTextChunk}.
   * @param {string | Chunk | Chunk[]} content - Content to append.
   * @returns {Promise<this>} The stream instance, for chaining.
   */
  async append (content: string | Chunk | Chunk[]): Promise<this> {
    if (!this._messageTs) {
      logger.debug('append() called before start() — skipping')
      return this
    }
    await this._api.call('chat.appendStream', {
      channel: this._channel,
      ts: this._messageTs,
      chunks: normalizeContent(content),
    })
    return this
  }

  /**
   * Stops the stream by calling `chat.stopStream`.
   * @param {string | Chunk | Chunk[]} [finalContent] - Optional final chunks to include in the closing payload.
   * @param {unknown[]} [blocks] - Optional top-level Block Kit blocks rendered as the final message layout.
   * @returns {Promise<this>} The stream instance, for chaining.
   */
  async stop (finalContent?: string | Chunk | Chunk[], blocks?: unknown[]): Promise<this> {
    if (!this._messageTs) {
      logger.debug('stop() called before start() — skipping')
      return this
    }
    const body: Record<string, unknown> = {
      channel: this._channel,
      ts: this._messageTs,
    }
    if (finalContent !== undefined) body.chunks = normalizeContent(finalContent)
    if (blocks !== undefined) body.blocks = blocks

    await this._api.call('chat.stopStream', body)
    return this
  }
}
