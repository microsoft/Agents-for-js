// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { ConversationParameters } from '@microsoft/agents-activity'
import type { ConversationClaims } from './conversation'

/**
 * Default OAuth scope for Azure Bot Service authentication.
 */
export const AzureBotScope = 'https://api.botframework.com'

/**
 * Options passed to `Proactive.createConversation()`.
 * Flattened — no nested Conversation wrapper.
 */
export interface CreateConversationOptions {
  /** JWT claims for the agent identity. `aud` must be the agent's client ID. */
  identity: ConversationClaims
  /** The target channel (e.g. `'msteams'`). */
  channelId: string
  /** The service URL for the channel. */
  serviceUrl: string
  /**
   * OAuth scope for token acquisition.
   * Defaults to `AzureBotScope` when not set by the builder.
   */
  scope: string
  /**
   * When `true`, the resulting `Conversation` is stored automatically after
   * creation. Defaults to `false`.
   */
  storeConversation?: boolean
  /** Conversation configuration passed to `adapter.createConversationAsync()`. */
  parameters: Partial<ConversationParameters>
}
