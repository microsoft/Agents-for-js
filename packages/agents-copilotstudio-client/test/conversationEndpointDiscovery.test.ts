/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { describe, it } from 'node:test'
import { Activity } from '@microsoft/agents-activity'
import { AgentType, ConnectionSettings, CopilotStudioClient, PowerPlatformCloud, UserAgentHelper } from '../src'
import { ConversationEndpoints, getConversationEndpointsDiscoveryUrl } from '../src/conversationEndpointDiscovery'
import { getCopilotStudioConnectionUrl, getCopilotStudioSubscribeUrl } from '../src/powerPlatformEnvironment'

const host = 'default5cae182f63ff49f99f353acc2724e73.8.environment.api.test.powerplatform.com'
const discoveryUrl = `https://${host}/copilotstudio/agents/test/conversation-endpoints`
const root = (agentic = false): string =>
  `https://${host}/copilotstudio${agentic ? '/agenticruntime/3p' : ''}/dataverse-backed/authenticated/bots/test/conversations`

function settings (): ConnectionSettings {
  return new ConnectionSettings({
    environmentId: 'Default-5cae182f-63ff-49f9-9f35-3acc2724e738',
    schemaName: 'test',
    cloud: PowerPlatformCloud.Test
  })
}

function endpoints (agentic = false): Record<string, string> {
  return {
    createConversation: `${root(agentic)}?api-version=create-version&extra=1`,
    executeTurn: `${root(agentic)}/{conversationId}?api-version=execute-version&extra=2`,
    continueTurn: `${root(agentic)}/{conversationId}/continue?api-version=continue-version`,
    subscribe: `${root(agentic)}/{conversationId}/subscribe?api-version=subscribe-version`
  }
}

function discoveryResponse (agentic = false): Response {
  return Response.json(endpoints(agentic), { headers: { 'Cache-Control': 'private, max-age=3600' } })
}

function streamResponse (): Response {
  return new Response('event: end\ndata: end\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
}

async function drain (stream: AsyncIterable<unknown>): Promise<void> {
  for await (const value of stream) {
    assert.ok(value)
  }
}

function deferred<T> (): { promise: Promise<T>, resolve: (value: T) => void } {
  let complete!: (value: T) => void
  const promise = new Promise<T>(resolve => { complete = resolve })
  return { promise, resolve: complete }
}

describe('conversation endpoint discovery', () => {
  for (const [cloud, environmentId, expectedHost] of [
    [PowerPlatformCloud.Test, 'Default-5cae182f-63ff-49f9-9f35-3acc2724e738', host],
    [PowerPlatformCloud.Prod, '11111111-1111-1111-1111-111111111111', '111111111111111111111111111111.11.environment.api.powerplatform.com']
  ] as const) {
    it(`uses the ${cloud} environment host and escapes the schema name`, () => {
      const config = new ConnectionSettings({ cloud, environmentId, schemaName: 'bot/name ?#' })
      assert.equal(getConversationEndpointsDiscoveryUrl(config), `https://${expectedHost}/copilotstudio/agents/bot%2Fname%20%3F%23/conversation-endpoints`)
    })
  }

  it('supports agentIdentifier and rejects missing settings', () => {
    const config = settings()
    config.schemaName = ''
    config.agentIdentifier = 'legacy'
    assert.equal(getConversationEndpointsDiscoveryUrl(config), `https://${host}/copilotstudio/agents/legacy/conversation-endpoints`)
    config.environmentId = ''
    assert.throws(() => getConversationEndpointsDiscoveryUrl(config), /must be provided/)
  })

  for (const agentic of [false, true]) {
    it(`persists and reuses exact ${agentic ? 'agentic' : 'classic'} operation URLs`, async (t) => {
      const config = settings()
      const client = new CopilotStudioClient(config, 'caller-token')
      const requests: Array<{ url: string, init?: RequestInit }> = []
      t.mock.method(globalThis, 'fetch', async (url: string | URL | Request, init?: RequestInit) => {
        requests.push({ url: String(url), init })
        return String(url) === discoveryUrl ? discoveryResponse(agentic) : streamResponse()
      })
      await drain(client.startConversationStreaming())
      assert.equal(config.directConnectUrl, endpoints(agentic).createConversation)
      const id = 'conversation/a ?#%'
      await drain(client.executeStreaming(new Activity('message'), id))
      await drain(client.sendActivityStreaming(new Activity('message'), id))
      await drain(client.subscribeAsync(id, 'last-event'))

      assert.deepEqual(requests.map(request => request.url), [
        discoveryUrl,
        endpoints(agentic).createConversation,
        endpoints(agentic).executeTurn.replace('{conversationId}', encodeURIComponent(id)),
        endpoints(agentic).executeTurn.replace('{conversationId}', encodeURIComponent(id)),
        endpoints(agentic).subscribe.replace('{conversationId}', encodeURIComponent(id))
      ])
      assert.equal(requests[0].init?.method, 'GET')
      assert.equal(requests[0].init?.redirect, 'error')
      const headers = new Headers(requests[0].init?.headers)
      assert.equal(headers.get('Accept'), 'application/json')
      assert.equal(headers.get('User-Agent'), UserAgentHelper.getProductInfo())
      for (const request of requests) {
        assert.equal(new Headers(request.init?.headers).get('Authorization'), 'Bearer caller-token')
      }
      assert.equal(new Headers(requests[4].init?.headers).get('Last-Event-ID'), 'last-event')
    })
  }

  for (const firstOperation of ['execute', 'send', 'subscribe'] as const) {
    it(`discovers when ${firstOperation} is the first operation`, async (t) => {
      const config = settings()
      const client = new CopilotStudioClient(config, 'token')
      const urls: string[] = []
      t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        urls.push(String(url))
        return String(url) === discoveryUrl ? discoveryResponse() : streamResponse()
      })
      const activity = new Activity('message')
      const stream = firstOperation === 'execute'
        ? client.executeStreaming(activity, 'first/id')
        : firstOperation === 'send'
          ? client.sendActivityStreaming(activity, 'first/id')
          : client.subscribeAsync('first/id')
      await drain(stream)
      assert.deepEqual(urls, [
        discoveryUrl,
        endpoints()[firstOperation === 'subscribe' ? 'subscribe' : 'executeTurn'].replace('{conversationId}', 'first%2Fid')
      ])
      assert.equal(config.directConnectUrl, endpoints().createConversation)
    })
  }

  it('shares in-flight discovery across concurrent calls', async (t) => {
    const config = settings()
    const client = new CopilotStudioClient(config, 'token')
    const pending = deferred<Response>()
    const entered = deferred<void>()
    let discoveries = 0
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      if (String(url) === discoveryUrl) {
        discoveries++
        entered.resolve()
        return pending.promise
      }
      return streamResponse()
    })
    const calls = [
      drain(client.startConversationStreaming()),
      drain(client.executeStreaming(new Activity('message'), 'one')),
      drain(client.subscribeAsync('two'))
    ]
    await entered.promise
    assert.equal(discoveries, 1)
    pending.resolve(discoveryResponse())
    await Promise.all(calls)
    assert.equal(discoveries, 1)
  })

  for (const status of [401, 403, 404, 500]) {
    it(`surfaces HTTP ${status} without guessed invocation URLs and allows retry`, async (t) => {
      const config = settings()
      const client = new CopilotStudioClient(config, 'token')
      let calls = 0
      t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        calls++
        assert.equal(String(url), discoveryUrl)
        return new Response('server error', { status })
      })
      for (let i = 0; i < 2; i++) {
        await assert.rejects(drain(client.startConversationStreaming()), new RegExp(`status ${status}`))
        assert.equal(config.directConnectUrl, undefined)
      }
      assert.equal(calls, 2)
    })
  }

  for (const token of ['', ' ']) {
    it('rejects an empty discovery token before sending a request', async (t) => {
      const fetchMock = t.mock.method(globalThis, 'fetch')
      const client = new CopilotStudioClient(settings(), token)
      await assert.rejects(drain(client.startConversationStreaming()), /non-empty access token/)
      assert.equal(fetchMock.mock.callCount(), 0)
    })
  }

  it('allows retry after a network failure', async (t) => {
    const config = settings()
    const client = new CopilotStudioClient(config, 'token')
    const networkError = new TypeError('network failure')
    let calls = 0
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      if (String(url) === discoveryUrl) {
        if (calls++ === 0) {
          throw networkError
        }
        return discoveryResponse()
      }
      return streamResponse()
    })
    await assert.rejects(drain(client.startConversationStreaming()), networkError)
    assert.equal(config.directConnectUrl, undefined)
    await drain(client.startConversationStreaming())
    assert.equal(calls, 2)
  })

  for (const body of ['', 'not json', 'null', '[]', '{}']) {
    it(`rejects invalid discovery response ${JSON.stringify(body)} without persisting a URL`, async (t) => {
      const config = settings()
      t.mock.method(globalThis, 'fetch', async () => new Response(body))
      await assert.rejects(drain(new CopilotStudioClient(config, 'token').startConversationStreaming()), /discovery returned an invalid/)
      assert.equal(config.directConnectUrl, undefined)
    })
  }

  it('clearing the discovered URL triggers fresh discovery', async (t) => {
    const config = settings()
    const client = new CopilotStudioClient(config, 'token')
    let discoveries = 0
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      return String(url) === discoveryUrl ? discoveryResponse(++discoveries === 2) : streamResponse()
    })
    await drain(client.startConversationStreaming())
    await drain(client.startConversationStreaming())
    assert.equal(discoveries, 1)
    config.directConnectUrl = ''
    await drain(client.startConversationStreaming())
    assert.equal(discoveries, 2)
    assert.equal(config.directConnectUrl, endpoints(true).createConversation)
  })

  it('honors an explicit URL configured after discovery', async (t) => {
    const config = settings()
    const client = new CopilotStudioClient(config, 'token')
    const urls: string[] = []
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      urls.push(String(url))
      return String(url) === discoveryUrl ? discoveryResponse() : streamResponse()
    })
    await drain(client.startConversationStreaming())
    config.directConnectUrl = 'https://explicit.example/bot'
    await drain(client.executeStreaming(new Activity('message'), 'new/id'))
    assert.equal(urls[2], getCopilotStudioConnectionUrl(config, 'new/id'))
    assert.equal(urls.length, 3)
  })

  for (const prebuilt of [false, true]) {
    it(`bypasses discovery for ${prebuilt ? 'prebuilt agents' : 'explicit direct URLs'}`, async (t) => {
      const config = prebuilt ? settings() : new ConnectionSettings({ directConnectUrl: 'https://explicit.example/bot' })
      if (prebuilt) {
        config.copilotAgentType = AgentType.Prebuilt
      }
      const urls: string[] = []
      t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
        urls.push(String(url))
        return streamResponse()
      })
      const client = new CopilotStudioClient(config, 'token')
      await drain(client.startConversationStreaming())
      await drain(client.subscribeAsync('id'))
      assert.deepEqual(urls, [getCopilotStudioConnectionUrl(config), getCopilotStudioSubscribeUrl(config, 'id')])
    })
  }

  it('allows execute without subscribe but reports unsupported subscriptions', async (t) => {
    const config = settings()
    const data = endpoints(true)
    delete data.subscribe
    const urls: string[] = []
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      urls.push(String(url))
      return String(url) === discoveryUrl ? Response.json(data) : streamResponse()
    })
    const client = new CopilotStudioClient(config, 'token')
    await drain(client.executeStreaming(new Activity('message'), 'id'))
    await assert.rejects(drain(client.subscribeAsync('id')), /does not advertise a subscribe endpoint/)
    assert.equal(urls.length, 2)
    assert.equal(config.directConnectUrl, data.createConversation)
  })

  it('honors configuration changed while discovery is in flight', async (t) => {
    const config = settings()
    const pending = deferred<Response>()
    const entered = deferred<void>()
    const urls: string[] = []
    t.mock.method(globalThis, 'fetch', async (url: string | URL | Request) => {
      urls.push(String(url))
      if (String(url) === discoveryUrl) {
        entered.resolve()
        return pending.promise
      }
      return streamResponse()
    })
    const call = drain(new CopilotStudioClient(config, 'token').startConversationStreaming())
    await entered.promise
    config.directConnectUrl = 'https://explicit.example/bot'
    pending.resolve(discoveryResponse())
    await call
    assert.equal(config.directConnectUrl, 'https://explicit.example/bot')
    assert.equal(urls[1], getCopilotStudioConnectionUrl(config))
  })
})

describe('discovered operation URL validation', () => {
  for (const value of [
    undefined, '', ' ', 42,
    'http://untrusted.example/conversations',
    'https://untrusted.example/conversations',
    `https://${host}.evil.example/conversations`,
    `https://user:password@${host}/conversations`,
    `https://${host}:444/conversations`,
    `https://${host}/conversations#fragment`,
    `https://${host}/conversations/{conversationId}`,
    `https://${host}/conversations/{other}`,
    `https://${host}/conversations/}`,
    'https://%'
  ]) {
    it(`rejects invalid create URL ${JSON.stringify(value)}`, () => {
      const data = { ...endpoints(), createConversation: value }
      assert.throws(() => new ConversationEndpoints(data, new URL(discoveryUrl)), /invalid operation URL/)
    })
  }

  for (const key of ['executeTurn', 'continueTurn', 'subscribe']) {
    for (const value of [
      `${root()}/id`,
      `${root()}/{conversationId}/{other}`,
      'https://untrusted.example/{conversationId}'
    ]) {
      it(`validates ${key} even when a different operation is requested`, () => {
        const data = { ...endpoints(), [key]: value }
        assert.throws(() => new ConversationEndpoints(data, new URL(discoveryUrl)), /invalid operation URL/)
      })
    }
  }

  it('accepts another environment host in the same cloud and preserves query strings', () => {
    const data = endpoints()
    data.executeTurn = data.executeTurn.replace(host, 'other.8.environment.api.test.powerplatform.com')
    const result = new ConversationEndpoints(data, new URL(discoveryUrl))
    assert.equal(result.getUrl('executeTurn', 'id/a ?#%'), data.executeTurn.replace('{conversationId}', 'id%2Fa%20%3F%23%25'))
    assert.equal(result.getUrl('createConversation'), data.createConversation)
    assert.throws(() => result.getUrl('executeTurn'), /conversation ID is required/)
  })
})
