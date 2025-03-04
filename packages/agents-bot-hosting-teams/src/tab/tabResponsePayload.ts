/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabResponseCards } from './tabResponseCards'
import { TabSuggestedActions } from './tabSuggestedActions'

/**
 * Interface representing the payload of a tab response.
 */
export interface TabResponsePayload {
  /**
   * Type of the response.
   */
  type?: 'continue' | 'auth' | 'silentAuth'
  /**
   * Value of the response, containing response cards.
   */
  value?: TabResponseCards
  /**
   * Suggested actions for the response.
   */
  suggestedActions?: TabSuggestedActions
}
