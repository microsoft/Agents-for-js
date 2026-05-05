// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import { SlackApi } from '../../src/api/slackApi.js'
import { SlackStream } from '../../src/api/slackStream.js'
import { SlackTaskStatus } from '../../src/api/slackTaskStatus.js'
import { taskUpdate } from '../../src/api/chunk.js'

describe('SlackStream', () => {
  let callStub: sinon.SinonStub
  let api: SlackApi

  beforeEach(() => {
    api = new SlackApi('xoxb-token')
    callStub = sinon.stub(api, 'call')
    callStub.resolves({ ok: true, ts: '123.456' })
  })

  it('start() calls chat.startStream with channel and thread_ts', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()

    assert.equal(callStub.callCount, 1)
    const [method, opts] = callStub.firstCall.args
    assert.equal(method, 'chat.startStream')
    assert.equal(opts.channel, 'C123')
    assert.equal(opts.thread_ts, '111.222')
  })

  it('start() passes recipientUserId, recipientTeamId, taskDisplayMode when provided', async () => {
    const stream = new SlackStream(api, 'C123', '111.222', {
      recipientUserId: 'U999',
      recipientTeamId: 'T888',
      taskDisplayMode: 'plan',
    })
    await stream.start()

    const opts = callStub.firstCall.args[1]
    assert.equal(opts.recipient_user_id, 'U999')
    assert.equal(opts.recipient_team_id, 'T888')
    assert.equal(opts.task_display_mode, 'plan')
  })

  it('append() calls chat.appendStream with stored ts', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()
    callStub.resolves({ ok: true })
    await stream.append('Hello world')

    assert.equal(callStub.callCount, 2)
    const [method, opts] = callStub.secondCall.args
    assert.equal(method, 'chat.appendStream')
    assert.equal(opts.ts, '123.456')
    assert.equal(opts.channel, 'C123')
    assert.deepStrictEqual(opts.chunks, [{ type: 'markdown_text', text: 'Hello world' }])
  })

  it('append() wraps string as markdown_text chunk', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()
    callStub.resolves({ ok: true })
    await stream.append('plain text')

    const chunks = callStub.secondCall.args[1].chunks
    assert.deepStrictEqual(chunks, [{ type: 'markdown_text', text: 'plain text' }])
  })

  it('append() accepts Chunk array', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()
    callStub.resolves({ ok: true })

    const chunk = taskUpdate({ id: 't1', title: 'Task', status: SlackTaskStatus.InProgress })
    await stream.append([chunk])

    const chunks = callStub.secondCall.args[1].chunks
    assert.deepStrictEqual(chunks, [chunk])
  })

  it('stop() calls chat.stopStream', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()
    callStub.resolves({ ok: true })
    await stream.stop('Final message')

    const [method, opts] = callStub.secondCall.args
    assert.equal(method, 'chat.stopStream')
    assert.equal(opts.ts, '123.456')
    assert.deepStrictEqual(opts.chunks, [{ type: 'markdown_text', text: 'Final message' }])
  })

  it('stop() passes top-level blocks separately', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await stream.start()
    callStub.resolves({ ok: true })
    const finalBlocks = [{ type: 'section', text: { type: 'mrkdwn', text: 'done' } }]
    await stream.stop(undefined, finalBlocks)

    const opts = callStub.secondCall.args[1]
    assert.deepStrictEqual(opts.blocks, finalBlocks)
  })

  it('append() throws when start() not called', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await assert.rejects(() => stream.append('ignored'), (err: Error) => {
      assert.ok(err.message.includes('-160003'))
      return true
    })
    assert.equal(callStub.callCount, 0)
  })

  it('stop() throws when start() not called', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    await assert.rejects(() => stream.stop('ignored'), (err: Error) => {
      assert.ok(err.message.includes('-160003'))
      return true
    })
    assert.equal(callStub.callCount, 0)
  })

  it('start() returns this for chaining', async () => {
    const stream = new SlackStream(api, 'C123', '111.222')
    const result = await stream.start()
    assert.strictEqual(result, stream)
  })
})
