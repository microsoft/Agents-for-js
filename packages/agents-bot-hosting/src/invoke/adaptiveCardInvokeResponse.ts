/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

export interface AdaptiveCardInvokeResponse {
  statusCode: number
  type: string
  value: Record<string, unknown>
}
