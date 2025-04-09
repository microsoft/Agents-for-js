/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { CardAction } from '@microsoft/agents-activity'

/**
 * Interface representing suggested actions for a tab.
 */
export interface TabSuggestedActions {
  /**
   * Array of card actions.
   */
  actions: CardAction[]
}
