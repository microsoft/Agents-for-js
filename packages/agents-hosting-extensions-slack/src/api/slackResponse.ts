// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Standard response envelope returned by the Slack Web API.
 */
export interface SlackResponse {
  /** Whether the API call succeeded. */
  ok: boolean
  /** Error code string when `ok` is false. */
  error?: string
  /** Non-fatal warning string. */
  warning?: string
  /** Timestamp of a created or updated message. */
  ts?: string
  [key: string]: unknown
}
