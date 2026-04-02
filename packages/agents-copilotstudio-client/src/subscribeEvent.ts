/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'

/**
 * Represents an event received from a subscription to a Copilot Studio conversation.
 */
export interface SubscribeEvent {
  /**
   * The activity from the copilot.
   */
  activity: Activity

  /**
   * The SSE event ID for resumption.
   * Can be used to resume subscription from a specific point.
   */
  eventId?: string
}

/**
 * Represents a request to subscribe to a conversation.
 */
export interface SubscribeRequest {
  /**
   * The conversation ID to subscribe to.
   */
  conversationId: string

  /**
   * The last received event ID for resumption.
   * If provided, subscription will resume from this point.
   */
  lastReceivedEventId?: string
}
