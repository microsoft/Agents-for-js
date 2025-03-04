/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-bot-hosting'

/**
 * Represents suggested actions for a messaging extension.
 */
export interface MessagingExtensionSuggestedAction {
  /**
   * A list of card actions.
   */
  actions?: CardAction[]
}
