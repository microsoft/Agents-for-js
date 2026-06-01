/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { describe, it } from 'node:test'
import assert from 'assert'
import { ActivityHandler, type Request } from '@microsoft/agents-hosting'
import { createAgentRequestHandler } from '../src/createAgentRequestHandler'
import { type WebResponse } from '../src/createAgentRequestHandler'

describe('createAgentRequestHandler', () => {
  const createMockResponse = (): WebResponse & { statusCode?: number, body?: unknown } => {
    return {
      headersSent: false,
      statusCode: undefined,
      body: undefined,
      status (code: number) {
        this.statusCode = code
        return this
      },
      setHeader (_name: string, _value: string) {
        return this
      },
      send (body?: unknown) {
        this.body = body
        this.headersSent = true
        return this
      },
      end () {
        this.headersSent = true
        return this
      }
    }
  }

  it('should complete without hanging when JWT middleware rejects request', async () => {
    const handler = createAgentRequestHandler(new ActivityHandler(), { clientId: 'test-app-id' })
    const req: Request = {
      method: 'POST',
      headers: {},
      body: { type: 'message', text: 'hello' }
    }
    const res = createMockResponse()

    await assert.doesNotReject(async () => {
      await Promise.race([
        handler(req, res),
        new Promise((resolve, reject) => setTimeout(() => reject(new Error('handler timed out')), 1000))
      ])
    })

    assert.strictEqual(res.statusCode, 401)
    assert.strictEqual(res.headersSent, true)
  })

  it('should reach adapter.process when middleware allows anonymous auth', async () => {
    const handler = createAgentRequestHandler(new ActivityHandler(), {})
    const req: Request = {
      method: 'POST',
      headers: {}
    }
    const res = createMockResponse()

    await assert.rejects(async () => {
      await handler(req, res)
    }, (error: any) => {
      return error instanceof TypeError
    })

    assert.strictEqual(res.statusCode, undefined)
    assert.strictEqual(res.headersSent, false)
  })

  it('should return a function', () => {
    const handler = createAgentRequestHandler(new ActivityHandler())
    assert.strictEqual(typeof handler, 'function')
  })
})
