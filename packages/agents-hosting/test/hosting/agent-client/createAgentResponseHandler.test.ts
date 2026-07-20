/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 *
 * Regression test for the createAgentResponseHandler missing-body guard:
 * a request without a parsed body must surface a stable MissingRequestBody
 * AgentError (matching CloudAdapter.process) rather than an opaque error from
 * deep inside normalizeIncomingActivity / Activity.fromObject.
 */

import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import {
  ActivityHandler,
  CloudAdapter,
  ConversationState,
  MemoryStorage,
  createAgentResponseHandler,
  HostingErrors,
  Request,
  WebResponse
} from '../../../src'

const makeRes = (): WebResponse => {
  const r: any = {
    headersSent: false,
    writableEnded: false,
    status () { return r },
    setHeader () { return r },
    send () { r.headersSent = true; return r },
    end () { r.writableEnded = true; return r }
  }
  return r
}

const makeHandler = () => {
  const adapter = new CloudAdapter({ clientId: 'test', tenantId: 't', issuers: [], connections: new Map() })
  const conversationState = new ConversationState(new MemoryStorage())
  return createAgentResponseHandler(adapter, new ActivityHandler(), conversationState)
}

describe('createAgentResponseHandler missing-body guard', () => {
  const params = { conversationId: 'c1', activityId: 'a1' }

  it('throws MissingRequestBody when req.body is undefined', async () => {
    const handler = makeHandler()
    await assert.rejects(
      () => handler({ headers: {}, method: 'POST' } as Request, makeRes(), params),
      (err: any) => {
        assert.strictEqual(err.code, HostingErrors.MissingRequestBody.code)
        return true
      }
    )
  })

  it('throws MissingRequestBody when req.body is null', async () => {
    const handler = makeHandler()
    await assert.rejects(
      () => handler({ headers: {}, method: 'POST', body: null } as unknown as Request, makeRes(), params),
      (err: any) => {
        assert.strictEqual(err.code, HostingErrors.MissingRequestBody.code)
        return true
      }
    )
  })
})
