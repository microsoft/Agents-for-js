/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import type { Strategy, StrategySettings } from './strategy'

/** @deprecated This interface will not be supported in future versions. Use StrategySettings instead. */
export interface PrebuiltBotStrategySettings {
  readonly host: URL;
  readonly identifier: string;
}

/**
 * Strategy for constructing PowerPlatform API connection URLs for prebuilt agents.
 */
export class PrebuiltBotStrategy implements Strategy {
  private readonly API_VERSION = '2022-03-01-preview'
  private baseURL: URL

  /**
   * @deprecated This constructor will not be supported in future versions. Use constructor (settings: StrategySettings).
   */
  constructor (settings: PrebuiltBotStrategySettings)
  constructor (settings: StrategySettings)
  constructor (settings: PrebuiltBotStrategySettings | StrategySettings) {
    const schema = 'schema' in settings ? settings.schema : settings.identifier
    const host = settings.host

    this.baseURL = new URL(
      `/copilotstudio/prebuilt/authenticated/bots/${schema}`,
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
