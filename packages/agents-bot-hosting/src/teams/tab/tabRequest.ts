/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabContext } from './tabContext'
import { TabEntityContext } from './tabEntityContext'

export interface TabRequest {
  tabContext?: TabEntityContext
  context?: TabContext
  state?: string
}
