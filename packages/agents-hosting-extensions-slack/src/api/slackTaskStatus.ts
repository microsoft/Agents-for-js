// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

export const SlackTaskStatus = {
  Pending: 'pending',
  InProgress: 'in_progress',
  Complete: 'complete',
  Error: 'error',
} as const

// eslint-disable-next-line @typescript-eslint/no-redeclare
export type SlackTaskStatus = typeof SlackTaskStatus[keyof typeof SlackTaskStatus]
