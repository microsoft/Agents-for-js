// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { describe, it } from 'node:test'
import assert from 'node:assert'
import { NamedPipeMessageHandler } from '../src/namedPipeMessageHandler.js'

function createMockProtocol () {
  return {
    calls: [] as Array<{
      verb: string
      path: string
      body: Buffer | null
      attachments?: unknown
      contentType?: string | null
    }>,
    async sendRequest (verb: string, path: string, body: Buffer | null, attachments?: unknown, contentType?: string | null) {
      this.calls.push({ verb, path, body, attachments, contentType })
      return { statusCode: 200, body: null }
    }
  }
}

describe('NamedPipeMessageHandler', () => {
  it('shouldHandle returns true for named pipe URLs and false for other URLs', () => {
    const handler = new NamedPipeMessageHandler()

    assert.strictEqual(handler.shouldHandle('urn:botframework:namedpipe:v3/conversations/123/activities'), true)
    assert.strictEqual(handler.shouldHandle('https://example.com'), false)
  })

  it('shouldHandle returns false for empty strings and partial prefixes', () => {
    const handler = new NamedPipeMessageHandler()

    assert.strictEqual(handler.shouldHandle(''), false)
    assert.strictEqual(handler.shouldHandle('urn:botframework:namedpipe'), false)
  })

  it('sendViaPipe returns 503 when no protocol is set', async () => {
    const handler = new NamedPipeMessageHandler()

    const response = await handler.sendViaPipe('POST', 'urn:botframework:namedpipe:v3/conversations/123/activities')

    assert.deepStrictEqual(response, { statusCode: 503, body: null })
  })

  it('sendViaPipe extracts /v3/ paths and calls sendRequest with the right args', async () => {
    const handler = new NamedPipeMessageHandler()
    const mockProtocol = createMockProtocol()
    handler.setProtocol(mockProtocol as never)

    const response = await handler.sendViaPipe('POST', 'urn:botframework:namedpipe://pipe/v3/conversations/123/activities')

    assert.deepStrictEqual(response, { statusCode: 200, body: null })
    assert.deepStrictEqual(mockProtocol.calls, [{
      verb: 'POST',
      path: '/v3/conversations/123/activities',
      body: null,
      attachments: undefined,
      contentType: undefined
    }])
  })

  it('sendViaPipe falls back to stripping the prefix when no /v3/ path exists', async () => {
    const handler = new NamedPipeMessageHandler()
    const mockProtocol = createMockProtocol()
    handler.setProtocol(mockProtocol as never)

    const response = await handler.sendViaPipe('GET', 'urn:botframework:namedpipe:api/messages')

    assert.deepStrictEqual(response, { statusCode: 200, body: null })
    assert.deepStrictEqual(mockProtocol.calls, [{
      verb: 'GET',
      path: '/api/messages',
      body: null,
      attachments: undefined,
      contentType: undefined
    }])
  })

  it('sendViaPipe forwards body, attachments, and contentType', async () => {
    const handler = new NamedPipeMessageHandler()
    const mockProtocol = createMockProtocol()
    handler.setProtocol(mockProtocol as never)
    const body = Buffer.from('hello')
    const attachments = [{
      id: 'attachment-1',
      contentType: 'text/plain',
      body: Buffer.from('attachment-body')
    }]
    const contentType = 'application/json'

    const response = await handler.sendViaPipe(
      'PUT',
      'urn:botframework:namedpipe://pipe/v3/conversations/123/activities',
      body,
      attachments,
      contentType
    )

    assert.deepStrictEqual(response, { statusCode: 200, body: null })
    assert.strictEqual(mockProtocol.calls.length, 1)
    assert.deepStrictEqual(mockProtocol.calls[0], {
      verb: 'PUT',
      path: '/v3/conversations/123/activities',
      body,
      attachments,
      contentType
    })
  })
})
