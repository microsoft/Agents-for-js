/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabContext } from './tabContext'
import { TabEntityContext } from './tabEntityContext'

/**
 * Interface representing a tab request.
 */
export interface TabRequest {
  /**
   * Context of the tab entity.
   */
  tabContext?: TabEntityContext
  /**
   * Context of the tab.
   */
  context?: TabContext
  /**
   * State of the tab request.
   */
  state?: string
}
