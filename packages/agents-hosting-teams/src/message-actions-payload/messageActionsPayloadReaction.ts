/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'

/**
 * The type of reaction.
 */
export type ReactionType = 'like' | 'heart' | 'laugh' | 'surprised' | 'sad' | 'angry'

/**
 * Represents a reaction in the message actions payload.
 */
export interface MessageActionsPayloadReaction {
  /**
   * The type of reaction.
   */
  reactionType?: ReactionType
  /**
   * The date and time when the reaction was created.
   */
  createdDateTime?: string
  /**
   * The user who reacted.
   */
  user?: MessageActionsPayloadFrom
}
