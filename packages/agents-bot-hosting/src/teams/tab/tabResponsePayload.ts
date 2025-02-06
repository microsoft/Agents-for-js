/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabResponseCards } from './tabResponseCards'
import { TabSuggestedActions } from './tabSuggestedActions'

export interface TabResponsePayload {
  type?: 'continue' | 'auth' | 'silentAuth'
  value?: TabResponseCards
  suggestedActions?: TabSuggestedActions
}
