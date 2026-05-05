// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper.js'
import type { SlackResponse } from './slackResponse.js'

/**
 * Turn-state key used to store and retrieve the {@link SlackApi} instance injected by {@link SlackAgentExtension}.
 */
export const SlackApiKey: unique symbol = Symbol('SlackApi')

/**
 * Thin HTTP client for the Slack Web API.
 *
 * @remarks
 * Uses Node's built-in `fetch`. An instance is injected into `context.turnState` by
 * {@link SlackAgentExtension} at the start of each turn and can be retrieved with
 * `context.turnState.get<SlackApi>(SlackApiKey)`.
 */
export class SlackApi {
  private readonly _token: string

  /**
   * Creates a new SlackApi client.
   * @param {string} token - Slack bot token (e.g. `xoxb-...`).
   */
  constructor (token: string) {
    this._token = token
  }

  /**
   * Calls a Slack Web API method.
   * @param {string} method - The API method name (e.g. `'chat.postMessage'`).
   * @param {Record<string, unknown>} [options] - Request payload. `null` and `undefined` values are omitted from the serialized body.
   * @returns {Promise<SlackResponse>} The parsed Slack API response.
   * @throws When the HTTP request fails or the API returns `ok: false`.
   */
  async call (method: string, options?: Record<string, unknown>): Promise<SlackResponse> {
    const body = options
      ? JSON.stringify(options, (_key, value) => (value === null || value === undefined ? undefined : value))
      : undefined

    let response: Response
    try {
      response = await fetch(`https://slack.com/api/${method}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this._token}`,
          'Content-Type': 'application/json',
        },
        body,
      })
    } catch (err) {
      throw ExceptionHelper.generateException(Error, Errors.SlackApiHttpError, err instanceof Error ? err : undefined, { status: 'network error' })
    }

    if (!response.ok) {
      throw ExceptionHelper.generateException(Error, Errors.SlackApiHttpError, undefined, { status: String(response.status) })
    }

    const data = await response.json() as SlackResponse

    if (!data.ok) {
      throw ExceptionHelper.generateException(Error, Errors.SlackApiError, undefined, { error: data.error ?? 'unknown' })
    }

    return data
  }
}
