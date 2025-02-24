/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TabContext } from './tabContext'
import { TabEntityContext } from './tabEntityContext'
import { TabSubmitData } from './tabSubmitData'

export interface TabSubmit {
  tabContext?: TabEntityContext
  context?: TabContext
  data?: TabSubmitData
}
