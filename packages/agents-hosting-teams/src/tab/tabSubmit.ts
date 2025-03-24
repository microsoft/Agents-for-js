/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabContext } from './tabContext'
import { TabEntityContext } from './tabEntityContext'
import { TabSubmitData } from './tabSubmitData'

/**
 * Interface representing a tab submit action.
 */
export interface TabSubmit {
  /**
   * Context of the tab entity.
   */
  tabContext?: TabEntityContext
  /**
   * Context of the tab.
   */
  context?: TabContext
  /**
   * Data submitted from the tab.
   */
  data?: TabSubmitData
}
