// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Activity } from '@microsoft/agents-activity'
import { CloudAdapter, INVOKE_RESPONSE_KEY } from '@microsoft/agents-hosting'
import { createLocalAdapter } from '../src/createLocalAdapter.js'
import { NamedPipeMessageHandler } from '../src/namedPipeMessageHandler.js'

const PIPE_URL = 'urn:botframework:namedpipe:test-pipe'

function delay (ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function createMockContext (serviceUrl: string) {
  const turnState = new Map()
  return {
    activity: Activity.fromObject({
      type: 'message',
      id: 'inbound-id',
      serviceUrl,
      channelId: 'directline',
      conversation: { id: 'conv1' },
      from: { id: 'user1' },
      recipient: { id: 'bot1' }
    }),
    turnState: {
      set: (key: symbol, value: unknown) => turnState.set(key, value),
      get: (key: symbol) => turnState.get(key),
      _map: turnState
    }
  } as any
}

function createActivity (overrides: Record<string, unknown> = {}) {
  return Activity.fromObject({
    type: 'message',
    id: 'outbound-id',
    serviceUrl: PIPE_URL,
    channelId: 'emulator',
    conversation: { id: 'conv1' },
    from: { id: 'bot1' },
    recipient: { id: 'user1' },
    ...overrides
  })
}

function createMockMessageHandler () {
  const handler = new NamedPipeMessageHandler()
  const calls: Array<{
    verb: string
    path: string
    body: Buffer | null
    attachments: unknown
    contentType: unknown
  }> = []

  handler.setProtocol({
    async sendRequest (verb: string, path: string, body: Buffer | null, attachments?: unknown, contentType?: unknown) {
      calls.push({ verb, path, body, attachments, contentType })
      return { statusCode: 200, body: Buffer.from('{"id":"resp1"}', 'utf8') }
    }
  } as any)

  return { handler, calls }
}

async function withPatchedSuperSendActivities (
  fn: (calls: Array<{ context: unknown, activities: unknown }>) => Promise<void>
): Promise<void> {
  const original = CloudAdapter.prototype.sendActivities
  const calls: Array<{ context: unknown, activities: unknown }> = []

  CloudAdapter.prototype.sendActivities = async function (context, activities) {
    calls.push({ context, activities })
    return [{ id: 'super-response' }]
  }

  try {
    await fn(calls)
  } finally {
    CloudAdapter.prototype.sendActivities = original
  }
}

describe('createLocalAdapter', () => {
  it('returns an adapter', () => {
    const adapter = createLocalAdapter()
    assert.ok(adapter)
    assert.strictEqual(typeof adapter.setMessageHandler, 'function')
  })

  it('routes sendActivities through pipe for pipe serviceUrl', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    await adapter.sendActivities(context, [createActivity()])
    await delay(50)

    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].verb, 'POST')
    assert.strictEqual(calls[0].path, '/v3/conversations/conv1/activities')
    assert.ok(calls[0].body)
  })

  it('skips trace activities on non-emulator channels', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    await adapter.sendActivities(context, [createActivity({ type: 'trace', channelId: 'msteams' })])
    await delay(50)

    assert.strictEqual(calls.length, 0)
  })

  it('stores invokeResponse in turnState using INVOKE_RESPONSE_KEY', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    const invokeResponse = createActivity({ type: 'invokeResponse', value: { status: 200 } })

    await adapter.sendActivities(context, [invokeResponse])
    await delay(50)

    assert.strictEqual(calls.length, 0)
    // Must be the same symbol CloudAdapter.processTurnResults reads from.
    // Symbol.for('InvokeResponse') is a DIFFERENT symbol and would silently
    // make every invoke turn return 501 NotImplemented.
    assert.strictEqual(context.turnState.get(INVOKE_RESPONSE_KEY), invokeResponse)
    assert.strictEqual(context.turnState.get(Symbol.for('InvokeResponse')), undefined)
  })

  it('falls through on empty activities', async () => {
    await withPatchedSuperSendActivities(async (superCalls) => {
      const adapter = createLocalAdapter()
      const { handler, calls } = createMockMessageHandler()
      adapter.setMessageHandler(handler)

      const context = createMockContext(PIPE_URL)
      const response = await adapter.sendActivities(context, [])
      await delay(20)

      assert.strictEqual(calls.length, 0)
      assert.strictEqual(superCalls.length, 1)
      assert.deepStrictEqual(response, [{ id: 'super-response' }])
    })
  })

  it('delegates to super for non-pipe serviceUrl', async () => {
    await withPatchedSuperSendActivities(async (superCalls) => {
      const adapter = createLocalAdapter()
      const { handler, calls } = createMockMessageHandler()
      adapter.setMessageHandler(handler)

      const context = createMockContext('https://example.com')
      const response = await adapter.sendActivities(context, [createActivity({ serviceUrl: 'https://example.com' })])
      await delay(20)

      assert.strictEqual(calls.length, 0)
      assert.strictEqual(superCalls.length, 1)
      assert.deepStrictEqual(response, [{ id: 'super-response' }])
    })
  })

  it('throws before accepting activities when the pipe send queue would overflow', async () => {
    const adapter = createLocalAdapter()
    const handler = new NamedPipeMessageHandler()
    let calls = 0

    handler.setProtocol({
      async sendRequest () {
        calls++
        return await new Promise(() => {})
      }
    } as any)
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    const activities = Array.from({ length: 111 }, (_value, index) => createActivity({ text: `activity-${index}` }))

    await assert.rejects(
      async () => await adapter.sendActivities(context, activities),
      /Named pipe send queue is full/
    )
    assert.strictEqual(calls, 0)
  })

  it('routes updateActivity through pipe for pipe serviceUrl', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    const activity = createActivity({ id: 'act-42', text: 'updated' })
    const response = await adapter.updateActivity(context, activity)

    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].verb, 'PUT')
    assert.ok(calls[0].path.endsWith('/v3/conversations/conv1/activities/act-42'), `unexpected path: ${calls[0].path}`)
    assert.strictEqual(calls[0].contentType, 'application/json')
    assert.deepStrictEqual(response, { id: 'resp1' })
  })

  it('routes deleteActivity through pipe for pipe serviceUrl', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    await adapter.deleteActivity(context, {
      serviceUrl: PIPE_URL,
      activityId: 'act-99',
      conversation: { id: 'conv1' } as any
    })

    assert.strictEqual(calls.length, 1)
    assert.strictEqual(calls[0].verb, 'DELETE')
    assert.ok(calls[0].path.endsWith('/v3/conversations/conv1/activities/act-99'), `unexpected path: ${calls[0].path}`)
    assert.strictEqual(calls[0].body, null)
  })

  it('delegates updateActivity to super for non-pipe serviceUrl', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const original = CloudAdapter.prototype.updateActivity
    const superCalls: Array<{ context: unknown, activity: unknown }> = []
    CloudAdapter.prototype.updateActivity = async function (context, activity) {
      superCalls.push({ context, activity })
      return { id: 'super-update' }
    }

    try {
      const context = createMockContext('https://example.com')
      const activity = createActivity({ id: 'act-1', serviceUrl: 'https://example.com' })
      const response = await adapter.updateActivity(context, activity)

      assert.strictEqual(calls.length, 0)
      assert.strictEqual(superCalls.length, 1)
      assert.deepStrictEqual(response, { id: 'super-update' })
    } finally {
      CloudAdapter.prototype.updateActivity = original
    }
  })

  it('delegates deleteActivity to super for non-pipe serviceUrl', async () => {
    const adapter = createLocalAdapter()
    const { handler, calls } = createMockMessageHandler()
    adapter.setMessageHandler(handler)

    const original = CloudAdapter.prototype.deleteActivity
    const superCalls: Array<{ context: unknown, reference: unknown }> = []
    CloudAdapter.prototype.deleteActivity = async function (context, reference) {
      superCalls.push({ context, reference })
    }

    try {
      const context = createMockContext('https://example.com')
      await adapter.deleteActivity(context, {
        serviceUrl: 'https://example.com',
        activityId: 'act-1',
        conversation: { id: 'conv1' } as any
      })

      assert.strictEqual(calls.length, 0)
      assert.strictEqual(superCalls.length, 1)
    } finally {
      CloudAdapter.prototype.deleteActivity = original
    }
  })

  it('caps in-flight pipe sends at MAX_CONCURRENT_SENDS even when many activities are scheduled in one tick', async () => {
    // Regression: _pendingSends was previously incremented inside setImmediate,
    // so the synchronous loop in sendActivities scheduled every activity past
    // the 10-slot cap without ever observing the limit. All 50 ended up
    // racing into the underlying handler instead of 10 active + 40 queued.
    const adapter = createLocalAdapter()
    const handler = new NamedPipeMessageHandler()
    let inflight = 0
    let observedPeak = 0

    handler.setProtocol({
      async sendRequest () {
        inflight++
        observedPeak = Math.max(observedPeak, inflight)
        try {
          // Hold the slot long enough for every queued send to drain
          await delay(40)
          return { statusCode: 200, body: null }
        } finally {
          inflight--
        }
      }
    } as any)
    adapter.setMessageHandler(handler)

    const context = createMockContext(PIPE_URL)
    const activities = Array.from({ length: 50 }, (_v, index) => createActivity({ text: `activity-${index}` }))

    await adapter.sendActivities(context, activities)

    // Reserved slot accounting must be visible synchronously
    const internals = adapter as unknown as { _pendingSends: number, _sendQueue: unknown[] }
    assert.strictEqual(internals._pendingSends, 10, 'all 10 concurrency slots should be reserved synchronously')
    assert.strictEqual(internals._sendQueue.length, 40, 'remaining 40 sends should be queued, not racing')

    // Drain everything
    await delay(500)
    assert.ok(observedPeak <= 10, `concurrent sends exceeded cap: peak=${observedPeak}`)
    assert.strictEqual(internals._pendingSends, 0, 'all slots should be released after draining')
    assert.strictEqual(internals._sendQueue.length, 0, 'queue should be empty after draining')
  })
})
