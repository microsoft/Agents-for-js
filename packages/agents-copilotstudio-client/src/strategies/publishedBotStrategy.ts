/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Strategy, StrategySettings } from './strategy'

/**
 * Strategy for constructing PowerPlatform API connection URLs for published agents.
 */
export class PublishedBotStrategy implements Strategy {
  private readonly API_VERSION = '2022-03-01-preview'
  private baseURL: URL

  constructor (settings: StrategySettings) {
    const { schema, host } = settings

    this.baseURL = new URL(
      `/copilotstudio/dataverse-backed/authenticated/bots/${schema}`,
      host
    )
    this.baseURL.searchParams.append('api-version', this.API_VERSION)
  }

  public getConversationUrl (conversationId?: string): string {
    const conversationUrl = new URL(this.baseURL.href)
    conversationUrl.pathname = `${conversationUrl.pathname}/conversations`

    if (conversationId) {
      conversationUrl.pathname = `${conversationUrl.pathname}/${conversationId}`
    }

    return conversationUrl.href
  }
}
