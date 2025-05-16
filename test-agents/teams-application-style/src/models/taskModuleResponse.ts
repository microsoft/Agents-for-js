// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { TaskModuleResponseBase } from '@microsoft/agents-hosting-extensions-teams'

export interface TaskModuleResponse {
  task?: TaskModuleResponseBase
  cacheInfo?: any // TODO CacheInfo
}
