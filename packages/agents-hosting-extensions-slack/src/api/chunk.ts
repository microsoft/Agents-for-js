// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { SlackTaskStatus } from './slackTaskStatus.js'

export interface Source {
  type: 'url'
  url: string
  text: string
}

export interface MarkdownTextChunk {
  type: 'markdown_text'
  text: string
}

export interface BlocksChunk {
  type: 'blocks'
  blocks: unknown[]
}

export interface TaskUpdateChunk {
  type: 'task_update'
  id: string
  title: string
  status: SlackTaskStatus
  details?: string
  output?: string
  sources?: Source[]
}

export interface PlanUpdateChunk {
  type: 'plan_update'
  title: string
}

export type Chunk = MarkdownTextChunk | BlocksChunk | TaskUpdateChunk | PlanUpdateChunk

export function markdown (text: string): MarkdownTextChunk {
  return { type: 'markdown_text', text }
}

export function blocks (blocks: unknown[]): BlocksChunk {
  return { type: 'blocks', blocks }
}

export function taskUpdate (options: Omit<TaskUpdateChunk, 'type'>): TaskUpdateChunk {
  return { type: 'task_update', ...options }
}

export function planUpdate (title: string): PlanUpdateChunk {
  return { type: 'plan_update', title }
}
