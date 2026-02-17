/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { Activity } from '@microsoft/agents-activity'

/**
 * Base interface for all Copilot Studio API responses.
 */
export interface ResponseBase {
  /**
   * The activities returned by the service.
   */
  activities: Activity[]

  /**
   * The conversation ID associated with this response.
   */
  conversationId: string
}

/**
 * Response returned when starting a new conversation.
 */
export interface StartResponse extends ResponseBase {
  /**
   * Indicates whether this is a new conversation.
   */
  isNewConversation: boolean
}

/**
 * Response returned when executing a turn in an existing conversation.
 */
export interface ExecuteTurnResponse extends ResponseBase {
  /**
   * The number of activities in this response.
   */
  activityCount: number
}

/**
 * Creates a StartResponse from an array of activities.
 * @param activities The activities to include in the response.
 * @param conversationId The conversation ID.
 * @returns A new StartResponse object.
 */
export function createStartResponse (
  activities: Activity[],
  conversationId: string
): StartResponse {
  return {
    activities,
    conversationId,
    isNewConversation: true
  }
}

/**
 * Creates an ExecuteTurnResponse from an array of activities.
 * @param activities The activities to include in the response.
 * @param conversationId The conversation ID.
 * @returns A new ExecuteTurnResponse object.
 */
export function createExecuteTurnResponse (
  activities: Activity[],
  conversationId: string
): ExecuteTurnResponse {
  return {
    activities,
    conversationId,
    activityCount: activities.length
  }
}
