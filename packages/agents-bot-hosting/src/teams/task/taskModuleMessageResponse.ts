/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TaskModuleResponseBase } from './taskModuleResponseBase'

export interface TaskModuleMessageResponse extends TaskModuleResponseBase {
  value?: string
}
