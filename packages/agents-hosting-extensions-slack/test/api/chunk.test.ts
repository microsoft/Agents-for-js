// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { markdown, blocks, taskUpdate, planUpdate } from '../../src/api/chunk.js'
import { SlackTaskStatus } from '../../src/api/slackTaskStatus.js'

describe('chunk factories', () => {
  it('markdown() creates a MarkdownTextChunk', () => {
    const chunk = markdown('hello')
    assert.deepStrictEqual(chunk, { type: 'markdown_text', text: 'hello' })
  })

  it('blocks() creates a BlocksChunk', () => {
    const b = [{ type: 'section' }]
    const chunk = blocks(b)
    assert.deepStrictEqual(chunk, { type: 'blocks', blocks: b })
  })

  it('taskUpdate() creates a TaskUpdateChunk', () => {
    const chunk = taskUpdate({
      id: 'task-1',
      title: 'Doing thing',
      status: SlackTaskStatus.InProgress,
    })
    assert.deepStrictEqual(chunk, {
      type: 'task_update',
      id: 'task-1',
      title: 'Doing thing',
      status: 'in_progress',
    })
  })

  it('planUpdate() creates a PlanUpdateChunk', () => {
    const chunk = planUpdate('My Plan')
    assert.deepStrictEqual(chunk, { type: 'plan_update', title: 'My Plan' })
  })
})
