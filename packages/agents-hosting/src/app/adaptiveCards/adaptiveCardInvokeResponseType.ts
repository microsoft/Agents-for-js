/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Represents the types of responses that can be returned when invoking an Adaptive Card.
 */
export enum AdaptiveCardInvokeResponseType {
  /**
   * Indicates a response containing an Adaptive Card.
   */
  ADAPTIVE = 'application/vnd.microsoft.card.adaptive',

  /**
   * Indicates a response containing a message activity.
   */
  MESSAGE = 'application/vnd.microsoft.activity.message',

  /**
   * Indicates a response containing a search result.
   */
  SEARCH = 'application/vnd.microsoft.search.searchResponse'
}
