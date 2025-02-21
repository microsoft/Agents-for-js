/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadFrom } from './messageActionsPayloadFrom'

export interface MessageActionsPayloadMention {
  id?: number
  mentionText?: string
  mentioned?: MessageActionsPayloadFrom
}
