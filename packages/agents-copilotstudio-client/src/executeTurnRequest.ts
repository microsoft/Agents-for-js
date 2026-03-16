/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'

/**
 * Represents a request to execute a turn in a conversation.
 * This class encapsulates the activity and optional conversation context.
 */
export class ExecuteTurnRequest {
  /** The activity to be executed. */
  activity?: Activity

  /** Optional conversation ID for this turn. */
  conversationId?: string

  /**
   * Creates an instance of ExecuteTurnRequest.
   * @param activity The activity to be executed.
   * @param conversationId Optional conversation ID.
   */
  constructor (activity?: Activity, conversationId?: string) {
    this.activity = activity
    this.conversationId = conversationId
  }
}
