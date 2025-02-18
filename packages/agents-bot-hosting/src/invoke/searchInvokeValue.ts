/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { SearchInvokeOptions } from './searchInvokeOptions'

export interface SearchInvokeValue {
  kind: string
  queryText: string
  queryOptions: SearchInvokeOptions
  context: any
}
