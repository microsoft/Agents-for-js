// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import type { SlackTaskStatus } from './slackTaskStatus.js'

/**
 * A URL source reference attached to a task update chunk.
 */
export interface Source {
  /** Must be `'url'`. */
  type: 'url'
  /** The URL of the source. */
  url: string
  /** Display text for the source link. */
  text: string
}

/**
 * A streaming chunk containing markdown-formatted text.
 */
export interface MarkdownTextChunk {
  /** Discriminant — always `'markdown_text'`. */
  type: 'markdown_text'
  /** Markdown text content. Maximum 12,000 characters. */
  text: string
}

/**
 * A streaming chunk containing Slack Block Kit blocks.
 */
export interface BlocksChunk {
  /** Discriminant — always `'blocks'`. */
  type: 'blocks'
  /** Array of Slack Block Kit block objects. Maximum 50 blocks. */
  blocks: unknown[]
}

/**
 * A streaming chunk that creates or updates a named task in the agentic task list.
 */
export interface TaskUpdateChunk {
  /** Discriminant — always `'task_update'`. */
  type: 'task_update'
  /** Unique identifier for the task within this stream. */
  id: string
  /** Display title of the task. */
  title: string
  /** Current status of the task. */
  status: SlackTaskStatus
  /** Optional detail text shown under the task title. Maximum 256 characters. */
  details?: string
  /** Optional output text shown when the task completes. Maximum 256 characters. */
  output?: string
  /** Optional list of source references for the task. */
  sources?: Source[]
}

/**
 * A streaming chunk that sets the title of the agentic plan display.
 */
export interface PlanUpdateChunk {
  /** Discriminant — always `'plan_update'`. */
  type: 'plan_update'
  /** Title of the plan. Maximum 256 characters. */
  title: string
}

/**
 * Discriminated union of all chunk types accepted by the Slack streaming API.
 */
export type Chunk = MarkdownTextChunk | BlocksChunk | TaskUpdateChunk | PlanUpdateChunk

/**
 * Creates a {@link MarkdownTextChunk}.
 * @param {string} text - Markdown text content.
 * @returns {MarkdownTextChunk} A markdown text chunk.
 */
export function markdown (text: string): MarkdownTextChunk {
  return { type: 'markdown_text', text }
}

/**
 * Creates a {@link BlocksChunk}.
 * @param {unknown[]} blocks - Array of Slack Block Kit block objects.
 * @returns {BlocksChunk} A blocks chunk.
 */
export function blocks (blocks: unknown[]): BlocksChunk {
  return { type: 'blocks', blocks }
}

/**
 * Creates a {@link TaskUpdateChunk}.
 * @param {Omit<TaskUpdateChunk, 'type'>} options - Task update fields.
 * @returns {TaskUpdateChunk} A task update chunk.
 */
export function taskUpdate (options: Omit<TaskUpdateChunk, 'type'>): TaskUpdateChunk {
  return { type: 'task_update', ...options }
}

/**
 * Creates a {@link PlanUpdateChunk}.
 * @param {string} title - Title of the plan.
 * @returns {PlanUpdateChunk} A plan update chunk.
 */
export function planUpdate (title: string): PlanUpdateChunk {
  return { type: 'plan_update', title }
}
