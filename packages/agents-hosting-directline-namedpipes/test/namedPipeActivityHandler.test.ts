// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NamedPipeActivityHandler } from '../src/namedPipeActivityHandler.js'
import { CloudAdapter } from '@microsoft/agents-hosting'
import type { NamedPipeRequest } from '../src/protocol/namedPipeRequest.js'

class MockAdapter extends CloudAdapter {
  processCallCount = 0
  lastActivity: any = null
  shouldThrow = false
  responseStatus = 200
  responseBody: unknown = undefined

  constructor () {
    super({ clientId: 'test', tenantId: 'test' })
  }

  override async process (req: any, res: any, logic: any): Promise<void> {
    this.processCallCount++
    this.lastActivity = req.body

    if (this.shouldThrow) {
      throw new Error('adapter error')
    }

    res.status(this.responseStatus)
    if (this.responseBody !== undefined) {
      res.send(this.responseBody)
    }

    if (logic) {
      await logic({ activity: req.body })
    }

    res.end()
  }
}

function createRequest (overrides: Partial<NamedPipeRequest> = {}): NamedPipeRequest {
  return {
    id: 'request-id',
    verb: 'POST',
    path: '/api/messages',
    contentType: 'application/json',
    body: Buffer.from(JSON.stringify({ type: 'message', id: 'activity-id', text: 'hello' }), 'utf8'),
    attachments: [],
    ...overrides
  }
}

describe('NamedPipeActivityHandler', () => {
  it('routes only POST /api/messages through the handler', async () => {
    const adapter = new MockAdapter()
    adapter.responseBody = { ok: true }
    const handler = new NamedPipeActivityHandler(adapter, async () => {})

    const getResponse = await handler.handle(createRequest({ verb: 'GET' }))
    const otherPathResponse = await handler.handle(createRequest({ path: '/other/path' }))
    const postResponse = await handler.handle(createRequest())

    assert.strictEqual(getResponse.statusCode, 404)
    assert.strictEqual(getResponse.body, null)
    assert.strictEqual(otherPathResponse.statusCode, 404)
    assert.strictEqual(otherPathResponse.body, null)
    assert.strictEqual(postResponse.statusCode, 200)
    assert.deepStrictEqual(JSON.parse(postResponse.body?.toString('utf8') ?? '{}'), { ok: true })
    assert.strictEqual(adapter.processCallCount, 1)
  })

  it('returns 400 when POST /api/messages is missing a request body', async () => {
    const handler = new NamedPipeActivityHandler(new MockAdapter(), async () => {})

    const response = await handler.handle(createRequest({ body: null }))

    assert.strictEqual(response.statusCode, 400)
    assert.deepStrictEqual(JSON.parse(response.body?.toString('utf8') ?? '{}'), { error: 'Missing request body' })
  })

  it('rejects non-JSON content types and accepts JSON with charset parameters', async () => {
    const adapter = new MockAdapter()
    const handler = new NamedPipeActivityHandler(adapter, async () => {})

    const unsupportedResponse = await handler.handle(createRequest({ contentType: 'text/plain' }))
    const acceptedResponse = await handler.handle(createRequest({ contentType: 'application/json; charset=utf-8' }))

    assert.strictEqual(unsupportedResponse.statusCode, 415)
    assert.strictEqual(unsupportedResponse.body, null)
    assert.strictEqual(acceptedResponse.statusCode, 200)
    assert.strictEqual(adapter.processCallCount, 1)
  })

  it('returns 400 when the body is not valid JSON', async () => {
    const handler = new NamedPipeActivityHandler(new MockAdapter(), async () => {})

    const response = await handler.handle(createRequest({ body: Buffer.from('{not valid json', 'utf8') }))

    assert.strictEqual(response.statusCode, 400)
    const parsed = JSON.parse(response.body?.toString('utf8') ?? '{}')
    assert.strictEqual(parsed.error, 'Invalid activity body')
  })

  it('passes valid activities to adapter.process and returns its status', async () => {
    const adapter = new MockAdapter()
    const handler = new NamedPipeActivityHandler(adapter, async () => {})

    const response = await handler.handle(createRequest())

    assert.strictEqual(response.statusCode, 200)
    assert.strictEqual(response.body, null)
    assert.strictEqual(adapter.processCallCount, 1)
    assert.strictEqual(adapter.lastActivity.type, 'message')
    assert.strictEqual(adapter.lastActivity.id, 'activity-id')
    assert.strictEqual(adapter.lastActivity.text, 'hello')
  })

  it('merges pipe attachments onto the activity attachments collection', async () => {
    const adapter = new MockAdapter()
    const handler = new NamedPipeActivityHandler(adapter, async () => {})
    const attachmentBody = Buffer.from('attachment-data', 'utf8')

    const response = await handler.handle(createRequest({
      attachments: [
        {
          id: 'attachment-1',
          contentType: 'text/plain',
          body: attachmentBody
        }
      ]
    }))

    assert.strictEqual(response.statusCode, 200)
    assert.ok(adapter.lastActivity.attachments)
    assert.strictEqual(adapter.lastActivity.attachments.length, 1)
    assert.strictEqual(adapter.lastActivity.attachments[0].contentType, 'text/plain')
    assert.deepStrictEqual(adapter.lastActivity.attachments[0].content, attachmentBody)
  })

  it('returns 500 when adapter.process throws', async () => {
    const adapter = new MockAdapter()
    adapter.shouldThrow = true
    const handler = new NamedPipeActivityHandler(adapter, async () => {})

    const response = await handler.handle(createRequest())

    assert.strictEqual(response.statusCode, 500)
    assert.strictEqual(response.body, null)
    assert.strictEqual(adapter.processCallCount, 1)
  })

  it('preserves existing activity attachments and appends pipe attachments', async () => {
    const adapter = new MockAdapter()
    const handler = new NamedPipeActivityHandler(adapter, async () => {})
    const existingAttachment = {
      contentType: 'application/json',
      content: { foo: 'bar' }
    }
    const pipeAttachmentBody = Buffer.from('pipe-bytes', 'utf8')

    const response = await handler.handle(createRequest({
      body: Buffer.from(JSON.stringify({
        type: 'message',
        id: 'activity-id',
        text: 'hello',
        attachments: [existingAttachment]
      }), 'utf8'),
      attachments: [
        {
          id: 'attachment-2',
          contentType: 'application/octet-stream',
          body: pipeAttachmentBody
        }
      ]
    }))

    assert.strictEqual(response.statusCode, 200)
    assert.ok(adapter.lastActivity.attachments)
    assert.strictEqual(adapter.lastActivity.attachments.length, 2)
    assert.deepStrictEqual(adapter.lastActivity.attachments[0], existingAttachment)
    assert.strictEqual(adapter.lastActivity.attachments[1].contentType, 'application/octet-stream')
    assert.deepStrictEqual(adapter.lastActivity.attachments[1].content, pipeAttachmentBody)
  })
})
