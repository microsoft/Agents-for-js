// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { ExceptionHelper } from '@microsoft/agents-activity'
import { Errors } from '../errorHelper.js'
import type { SlackResponse } from './slackResponse.js'

export const SlackApiKey: unique symbol = Symbol('SlackApi')

export class SlackApi {
  private readonly _token: string

  constructor (token: string) {
    this._token = token
  }

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
