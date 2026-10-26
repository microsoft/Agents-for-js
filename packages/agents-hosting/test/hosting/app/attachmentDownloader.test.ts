import { afterEach, beforeEach, describe, it } from 'node:test'
import { promises as dns } from 'node:dns'
import assert from 'node:assert'
import sinon from 'sinon'

import { Activity } from '@microsoft/agents-activity'
import { AttachmentDownloader } from '../../../src/app/attachmentDownloader'
import { MsalTokenProvider } from '../../../src/auth'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'
import { JwtPayload } from 'jsonwebtoken'
import { ConnectorClient, InputFile, M365AttachmentDownloader, OutboundHostValidator, TurnState } from '../../../src'

function createContext (identity?: JwtPayload) {
  const adapter = new TestAdapter()
  const activity = Activity.fromObject({
    type: 'message',
    channelId: 'test',
    serviceUrl: 'https://service.example',
    conversation: { id: 'conversation' },
    from: { id: 'user' },
    recipient: { id: 'bot' },
    attachments: [{
      contentType: 'text/plain',
      contentUrl: 'https://files.example/file.txt'
    }]
  })

  return new TurnContext(adapter, activity, identity)
}

function createM365Context (downloadUrl = 'https://files.example/file', token = 'm365-dummy') {
  const context = createContext()
  context.activity.channelId = 'msteams'
  context.activity.attachments![0].content = { downloadUrl }
  context.turnState.set(context.adapter.ConnectorClientKey, ConnectorClient.createClientWithToken('https://service.example', token))
  return context
}

describe('AttachmentDownloader', () => {
  afterEach(() => {
    sinon.restore()
  })

  it('uses adapter connection manager token provider when available', async () => {
    const identity = { appid: 'app-id' } as JwtPayload
    const context = createContext(identity)
    const getAccessToken = sinon.stub().resolves('connection-token')
    const getTokenProviderFromActivity = sinon.stub().returns({ getAccessToken })
    ;(context.adapter as any).connectionManager = { getTokenProviderFromActivity }

    const downloader = new AttachmentDownloader()
    const getStub = sinon.stub().resolves({ data: new ArrayBuffer(1) })
    ;(downloader as any)._httpClient.get = getStub

    await downloader.downloadFiles(context)

    sinon.assert.calledOnceWithExactly(getTokenProviderFromActivity, identity, context.activity)
    sinon.assert.calledOnceWithExactly(getAccessToken, 'app-id')
    sinon.assert.calledOnce(getStub)
    assert.equal(getStub.firstCall.args[1].headers.Authorization, 'Bearer connection-token')
  })

  it('falls back to MSAL token provider when no connection manager is available', async () => {
    const context = createContext()
    const tokenStub = sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('fallback-token')

    const downloader = new AttachmentDownloader()
    const getStub = sinon.stub().resolves({ data: new ArrayBuffer(1) })
    ;(downloader as any)._httpClient.get = getStub

    await downloader.downloadFiles(context)

    sinon.assert.calledOnce(tokenStub)
    assert.equal(getStub.firstCall.args[1].headers.Authorization, 'Bearer fallback-token')
  })
})

describe('attachment downloader outbound host validation', () => {
  beforeEach(() => {
    sinon.stub(dns, 'lookup').resolves([{ address: '93.184.216.34', family: 4 }])
  })

  describe('public attachment download security and compatibility', () => {
    beforeEach(() => {
      sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('generic-dummy')
    })
    afterEach(() => sinon.restore())

    for (const m365 of [false, true]) {
      const name = m365 ? 'M365' : 'generic'

      it(`${name} keeps default token forwarding and native redirects without DNS checks`, async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('legacy'))
        const context = m365 ? createM365Context('http://127.0.0.1/file') : createContext()
        if (!m365) context.activity.attachments![0].contentUrl = 'http://localhost/file'
        const downloader = m365 ? new M365AttachmentDownloader() : new AttachmentDownloader()

        const files = await downloader.downloadFiles(context)

        assert.equal(files[0].content.toString(), 'legacy')
        assert.equal(fetchStub.firstCall.args[1]?.redirect, undefined)
        assert.equal(
          new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'),
          `Bearer ${m365 ? 'm365-dummy' : 'generic-dummy'}`
        )
        sinon.assert.notCalled(dns.lookup)
      })

      it(`${name} stores successfully downloaded bytes and sends credentials only to the first hop`, async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch')
        fetchStub.onFirstCall().resolves(new Response('redirect', { status: 302, headers: { location: '/final' } }))
        fetchStub.onSecondCall().resolves(new Response('contents', { headers: { 'content-type': 'text/plain' } }))
        const context = m365 ? createM365Context() : createContext()
        const policy = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
        const downloader = m365
          ? new M365AttachmentDownloader('downloadedFiles', policy)
          : new AttachmentDownloader('downloadedFiles', policy)
        const state = new TurnState()
        await state.load(context)

        await downloader.downloadAndStoreFiles(context, state)

        const files = state.getValue<InputFile[]>('downloadedFiles')
        assert.equal(files.length, 1)
        assert.equal(files[0].content.toString(), 'contents')
        assert.equal(files[0].contentType, 'text/plain')
        assert.equal(files[0].contentUrl, context.activity.attachments![0].contentUrl)
        assert.equal(
          new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'),
          `Bearer ${m365 ? 'm365-dummy' : 'generic-dummy'}`
        )
        assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)
      })

      it(`${name} skips a disallowed destination without fetching or storing bytes`, async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch')
        const context = m365 ? createM365Context('https://evil.example/file') : createContext()
        if (!m365) context.activity.attachments![0].contentUrl = 'https://evil.example/file'
        const policy = new OutboundHostValidator({ enabled: true })
        const downloader = m365 ? new M365AttachmentDownloader('inputFiles', policy) : new AttachmentDownloader('inputFiles', policy)
        const state = new TurnState()
        await state.load(context)

        await downloader.downloadAndStoreFiles(context, state)

        assert.deepEqual(state.getValue('inputFiles'), [])
        sinon.assert.notCalled(fetchStub)
        sinon.assert.notCalled(dns.lookup)
      })

      it(`${name} preserves inline content and filters HTML attachments`, async () => {
        const fetchStub = sinon.stub(globalThis, 'fetch')
        const context = m365 ? createM365Context() : createContext()
        context.activity.attachments = [
          { contentType: 'text/html', contentUrl: 'https://files.example/ignored' },
          { contentType: 'text/plain', content: Buffer.from('inline') }
        ]
        const downloader = m365 ? new M365AttachmentDownloader() : new AttachmentDownloader()
        const files = await downloader.downloadFiles(context)
        assert.equal(files.length, 1)
        assert.equal(files[0].content.toString(), 'inline')
        sinon.assert.notCalled(fetchStub)
      })
    }

    it('rejects an HTTP M365 downloadUrl despite an HTTPS contentUrl when enabled', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createM365Context('http://files.example/file')
      const downloader = new M365AttachmentDownloader('inputFiles', new OutboundHostValidator({
        enabled: true, hosts: ['files.example']
      }))
      assert.deepEqual(await downloader.downloadFiles(context), [])
      sinon.assert.notCalled(fetchStub)
      sinon.assert.notCalled(dns.lookup)
    })

    it('validates M365 fallback contentUrl and retains non-Teams channel filtering', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createM365Context()
      context.activity.attachments![0].content = undefined
      context.activity.attachments![0].contentUrl = 'https://evil.example/file'
      const downloader = new M365AttachmentDownloader('inputFiles', new OutboundHostValidator({ enabled: true }))
      assert.deepEqual(await downloader.downloadFiles(context), [])
      context.activity.channelId = 'test'
      assert.deepEqual(await downloader.downloadFiles(context), [])
      sinon.assert.notCalled(fetchStub)
    })

    it('isolates M365 header snapshots across overlapping turns with multiple attachments', async () => {
      const started = Promise.withResolvers<void>()
      const release = Promise.withResolvers<void>()
      const requests: Array<{ url: string, authorization: string | null }> = []
      sinon.stub(globalThis, 'fetch').callsFake(async (url, options) => {
        const target = String(url)
        requests.push({ url: target, authorization: new Headers(options?.headers).get('authorization') })
        if (target.endsWith('/first')) {
          started.resolve()
          await release.promise
        }
        return new Response('contents')
      })
      const first = createM365Context('https://files.example/first', 'first-dummy')
      first.activity.attachments!.push({
        contentType: 'text/plain',
        contentUrl: 'https://files.example/attachment',
        content: { downloadUrl: 'https://files.example/second' }
      })
      const second = createM365Context('https://files.example/other', 'second-dummy')
      const downloader = new M365AttachmentDownloader()

      const firstDownload = downloader.downloadFiles(first)
      await started.promise
      try {
        await downloader.downloadFiles(second)
      } finally {
        release.resolve()
      }
      await firstDownload

      assert.deepEqual(requests, [
        { url: 'https://files.example/first', authorization: 'Bearer first-dummy' },
        { url: 'https://files.example/other', authorization: 'Bearer second-dummy' },
        { url: 'https://files.example/second', authorization: 'Bearer first-dummy' }
      ])
    })
  })
  afterEach(() => sinon.restore())

  it('skips a disallowed generic attachment without issuing a request', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch')
    const downloader = new AttachmentDownloader(
      'inputFiles',
      new OutboundHostValidator({ enabled: true })
    )

    const result = await (downloader as any).downloadFile({
      contentType: 'application/octet-stream',
      contentUrl: 'https://evil.example.com/file'
    }, 'secret-token')

    assert.equal(result, undefined)
    sinon.assert.notCalled(fetchStub)
  })

  it('downloads an attachment from an allowed host using manual redirects when enabled', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('contents', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' }
    }))
    const downloader = new AttachmentDownloader(
      'inputFiles',
      new OutboundHostValidator({ enabled: true, hosts: ['files.contoso.com'] })
    )

    const result = await (downloader as any).downloadFile({
      contentType: 'application/octet-stream',
      contentUrl: 'https://files.contoso.com/file'
    }, 'secret-token')

    assert.equal(result.content.toString(), 'contents')
    assert.equal(fetchStub.firstCall.args[1]?.redirect, 'manual')
  })

  it('validates the actual M365 downloadUrl instead of contentUrl', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch')
    const downloader = new M365AttachmentDownloader(
      'inputFiles',
      new OutboundHostValidator({ enabled: true })
    )

    const result = await (downloader as any).downloadFile({
      contentType: 'application/octet-stream',
      contentUrl: 'https://graph.microsoft.com/attachment',
      content: { downloadUrl: 'https://evil.example.com/token-target' }
    })

    assert.equal(result, undefined)
    sinon.assert.notCalled(fetchStub)
  })

  it('preserves existing download behavior when validation is disabled', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('contents', {
      status: 200,
      headers: { 'content-type': 'application/octet-stream' }
    }))
    const downloader = new M365AttachmentDownloader(
      'inputFiles',
      new OutboundHostValidator({ enabled: false })
    )

    const result = await (downloader as any).downloadFile({
      contentType: 'application/octet-stream',
      contentUrl: 'https://evil.example.com/attachment',
      content: { downloadUrl: 'https://evil.example.com/file' }
    })

    assert.equal(result.content.toString(), 'contents')
    sinon.assert.calledOnce(fetchStub)
    assert.equal(fetchStub.firstCall.args[1]?.redirect, undefined)
  })
})
