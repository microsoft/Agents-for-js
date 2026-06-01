// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Status values for a Slack task update chunk sent via the streaming API.
 */
export const SlackTaskStatus = {
  /** Task has been created but not yet started. */
  Pending: 'pending',
  /** Task is currently running. */
  InProgress: 'in_progress',
  /** Task finished successfully. */
  Complete: 'complete',
  /** Task finished with an error. */
  Error: 'error',
} as const

/**
 * Union type of all valid {@link SlackTaskStatus} values.
 */
// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SlackTaskStatus = typeof SlackTaskStatus[keyof typeof SlackTaskStatus]
