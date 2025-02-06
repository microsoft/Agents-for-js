/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface InvokeResponse<T = any> {
  status: number
  body?: T
}
