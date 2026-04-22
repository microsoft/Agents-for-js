// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { debug } from '@microsoft/agents-activity/logger'
import type { SlackApi } from './slackApi.js'
import { markdown, type Chunk } from './chunk.js'

const logger = debug('agents:slack:stream')

export interface SlackStreamOptions {
  recipientUserId?: string
  recipientTeamId?: string
  taskDisplayMode?: 'timeline' | 'plan'
}

function normalizeContent (content: string | Chunk | Chunk[]): Chunk[] {
  if (typeof content === 'string') return [markdown(content)]
  if (Array.isArray(content)) return content
  return [content]
}

export class SlackStream {
  private readonly _api: SlackApi
  private readonly _channel: string
  private readonly _threadTs: string
  private readonly _options: SlackStreamOptions | undefined
  private _messageTs: string | undefined

  constructor (api: SlackApi, channel: string, threadTs: string, options?: SlackStreamOptions) {
    this._api = api
    this._channel = channel
    this._threadTs = threadTs
    this._options = options
  }

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
