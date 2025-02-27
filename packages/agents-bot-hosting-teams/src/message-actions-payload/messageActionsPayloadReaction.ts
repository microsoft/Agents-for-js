/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'

export type ReactionType = 'like' | 'heart' | 'laugh' | 'surprised' | 'sad' | 'angry'

export interface MessageActionsPayloadReaction {
  reactionType?: ReactionType
  createdDateTime?: string
  user?: MessageActionsPayloadFrom
}
