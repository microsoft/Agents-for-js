/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { MessageActionsPayloadApp } from './messageActionsPayloadApp'
import { MessageActionsPayloadConversation } from './messageActionsPayloadConversation'
import { MessageActionsPayloadUser } from './messageActionsPayloadUser'

export interface MessageActionsPayloadFrom {
  user?: MessageActionsPayloadUser
  application?: MessageActionsPayloadApp
  conversation?: MessageActionsPayloadConversation
}
