// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export interface SlackResponse {
  ok: boolean
  error?: string
  warning?: string
  ts?: string
  [key: string]: unknown
}
