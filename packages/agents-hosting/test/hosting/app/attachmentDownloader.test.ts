import { afterEach, beforeEach, describe, it } from 'node:test'
import { promises as dns, type LookupAddress, type LookupAllOptions } from 'node:dns'
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
  // The downloader calls dns.lookup with { all: true }, which returns an array.
  const dnsWithAllResults: { lookup(hostname: string, options: LookupAllOptions): Promise<LookupAddress[]> } = dns
  let lookupStub: sinon.SinonSpy

  beforeEach(() => {
    lookupStub = sinon.stub(dnsWithAllResults, 'lookup').resolves([{ address: '93.184.216.34', family: 4 }])
  })

  describe('public attachment download security and compatibility', () => {
    beforeEach(() => {
      sinon.stub(MsalTokenProvider.prototype, 'getAccessToken').resolves('generic-dummy')
    })
    afterEach(() => sinon.restore())

    it('generic downloads a localhost HTTP attachment', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('legacy'))
      const context = createContext()
      context.activity.attachments![0].contentUrl = 'http://localhost/file'
      const downloader = new AttachmentDownloader()

      const files = await downloader.downloadFiles(context)

      assert.equal(files[0].content.toString(), 'legacy')
      assert.equal(fetchStub.firstCall.args[1]?.redirect, undefined)
      assert.equal(
        new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'),
        'Bearer generic-dummy'
      )
      sinon.assert.notCalled(lookupStub)
    })

    it('generic stores downloaded bytes and applies its credential policy across redirects', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      fetchStub.onFirstCall().resolves(new Response('redirect', { status: 302, headers: { location: '/final' } }))
      fetchStub.onSecondCall().resolves(new Response('contents', { headers: { 'content-type': 'text/plain' } }))
      const context = createContext()
      const policy = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
      const downloader = new AttachmentDownloader('downloadedFiles', policy)
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
        'Bearer generic-dummy'
      )
      assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)
    })

    it('generic skips a disallowed destination without fetching or storing bytes', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createContext()
      context.activity.attachments![0].contentUrl = 'https://evil.example/file'
      const policy = new OutboundHostValidator({ enabled: true })
      const downloader = new AttachmentDownloader('inputFiles', policy)
      const state = new TurnState()
      await state.load(context)

      await downloader.downloadAndStoreFiles(context, state)

      assert.deepEqual(state.getValue('inputFiles'), [])
      sinon.assert.notCalled(fetchStub)
      sinon.assert.notCalled(lookupStub)
    })

    it('generic preserves inline content and filters HTML attachments', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createContext()
      context.activity.attachments = [
        { contentType: 'text/html', contentUrl: 'https://files.example/ignored' },
        { contentType: 'text/plain', content: Buffer.from('inline') }
      ]
      const downloader = new AttachmentDownloader()
      const files = await downloader.downloadFiles(context)
      assert.equal(files.length, 1)
      assert.equal(files[0].content.toString(), 'inline')
      sinon.assert.notCalled(fetchStub)
    })

    it('M365 skips a signed HTTP URL', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('legacy'))
      const context = createM365Context('http://127.0.0.1/file')
      const downloader = new M365AttachmentDownloader()

      const files = await downloader.downloadFiles(context)

      assert.deepEqual(files, [])
      sinon.assert.notCalled(fetchStub)
    })

    it('M365 stores downloaded bytes and applies its credential policy across redirects', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      fetchStub.onFirstCall().resolves(new Response('redirect', { status: 302, headers: { location: '/final' } }))
      fetchStub.onSecondCall().resolves(new Response('contents', { headers: { 'content-type': 'text/plain' } }))
      const context = createM365Context()
      const policy = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
      const downloader = new M365AttachmentDownloader('downloadedFiles', policy)
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
        null
      )
      assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)
    })

    it('M365 skips a disallowed destination without fetching or storing bytes', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createM365Context('https://evil.example/file')
      const policy = new OutboundHostValidator({ enabled: true })
      const downloader = new M365AttachmentDownloader('inputFiles', policy)
      const state = new TurnState()
      await state.load(context)

      await downloader.downloadAndStoreFiles(context, state)

      assert.deepEqual(state.getValue('inputFiles'), [])
      sinon.assert.notCalled(fetchStub)
      sinon.assert.notCalled(lookupStub)
    })

    it('M365 preserves inline content and filters HTML attachments', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createM365Context()
      context.activity.attachments = [
        { contentType: 'text/html', contentUrl: 'https://files.example/ignored' },
        { contentType: 'text/plain', content: Buffer.from('inline') }
      ]
      const downloader = new M365AttachmentDownloader()
      const files = await downloader.downloadFiles(context)
      assert.equal(files.length, 1)
      assert.equal(files[0].content.toString(), 'inline')
      sinon.assert.notCalled(fetchStub)
    })

    it('downloads a signed URL without contentUrl or connector and skips invalid signed metadata', async () => {
      const context = createContext()
      context.activity.channelId = 'msteams'
      context.activity.attachments = [
        { contentType: 'image/png', content: { downloadUrl: 'https://files.example/signed' }, name: 'picture.png' },
        { contentType: 'image/png', content: { downloadUrl: false }, contentUrl: 'https://files.example/fallback' }
      ]
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(new Uint8Array([1])))
      const files = await new M365AttachmentDownloader().downloadFiles(context)
      sinon.assert.calledOnce(fetchStub)
      assert.equal(files[0].filename, 'picture.png')
      assert.equal(new Headers(fetchStub.firstCall.args[1]?.headers).has('authorization'), false)
    })

    it('binds pasted images to the service path and prefers the byte signature', async () => {
      const context = createM365Context()
      context.activity.serviceUrl = 'https://service.example/bot/'
      const image = '/v3/attachments/abc/views/original'
      context.activity.attachments = [
        { contentType: 'text/html', content: '<img itemtype="http://schema.skype.com/AMSImage" itemid="abc" itemscope="gif">' },
        { contentType: 'image/*', contentUrl: 'https://files.example/bot' + image },
        { contentType: 'image/*', contentUrl: 'https://service.example/other' + image },
        { contentType: 'image/*', contentUrl: 'https://service.example/bot' + image }
      ]
      const fetchStub = sinon.stub(globalThis, 'fetch')
      fetchStub.onFirstCall().resolves(new Response(Uint8Array.from([255, 216, 255])))
      fetchStub.onSecondCall().resolves(new Response('unknown'))
      const downloader = new M365AttachmentDownloader()
      const [file] = await downloader.downloadFiles(context)
      sinon.assert.calledOnce(fetchStub)
      assert.equal(new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'), 'Bearer m365-dummy')
      assert.equal(file.filename, 'image-abc.jpg')
      assert.equal(file.contentType, 'image/jpeg')
      assert.equal((await downloader.downloadFiles(context))[0].filename, 'image-abc.gif')
    })

    it('keeps image authorization on local redirects and drops it permanently after leaving the origin', async () => {
      const context = createM365Context()
      context.activity.attachments = [{
        contentType: 'image/jpeg',
        contentUrl: 'https://service.example/v3/attachments/abc/views/original'
      }]
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const locations = ['/local', 'https://files.example/shared', 'https://service.example/returned']
      for (const [index, location] of locations.entries()) {
        fetchStub.onCall(index).resolves(new Response(null, { status: 302, headers: { location } }))
      }
      fetchStub.onCall(3).resolves(new Response('content'))
      assert.equal((await new M365AttachmentDownloader().downloadFiles(context)).length, 1)
      const headers = fetchStub.getCalls().map(call => new Headers(call.args[1]?.headers).get('authorization'))
      assert.deepEqual(headers, ['Bearer m365-dummy', 'Bearer m365-dummy', null, null])
    })

    it('skips failed signed URLs and HTTPS downgrades without retrying the content URL', async () => {
      const context = createM365Context()
      context.activity.attachments!.push(context.activity.attachments![0])
      const fetchStub = sinon.stub(globalThis, 'fetch')
      fetchStub.onFirstCall().resolves(new Response(null, { status: 403 }))
      fetchStub.onSecondCall().resolves(new Response(null, { status: 302, headers: { location: 'http://files.example/file' } }))
      assert.deepEqual(await new M365AttachmentDownloader().downloadFiles(context), [])
      sinon.assert.calledTwice(fetchStub)
      for (const call of fetchStub.getCalls()) {
        assert.equal(call.args[0], 'https://files.example/file')
        assert.equal(new Headers(call.args[1]?.headers).has('authorization'), false)
      }
    })

    it('uses an agentic Graph token once per batch and releases it on cross-origin redirects', async () => {
      const context = createM365Context()
      const sharingUrl = 'https://share.example/some%20file'
      const file = { name: 'shared.txt', contentType: 'application/vnd.microsoft.teams.file.download.info', contentUrl: sharingUrl, content: {} }
      context.activity.attachments = [file, file]
      const getAgenticUserToken = sinon.stub().resolves('opaque-token')
      ;(context.adapter as any).connectionManager = { getTokenProviderFromActivity: () => ({ getAgenticUserToken }) }
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const downloader = new M365AttachmentDownloader('inputFiles', undefined, 'https://graph.example/v1.0')
      assert.deepEqual(await downloader.downloadFiles(context), [])
      sinon.assert.notCalled(fetchStub)
      context.activity.recipient = { id: 'agent', role: 'agenticUser', tenantId: 'tenant', agenticAppId: 'app', agenticUserId: 'user' }
      fetchStub.onFirstCall().resolves(new Response(null, { status: 302, headers: { location: 'https://files.example/shared' } }))
      fetchStub.onSecondCall().resolves(new Response('first'))
      fetchStub.onThirdCall().resolves(new Response('second'))
      const files = await downloader.downloadFiles(context)
      assert.equal(files.length, 2)
      sinon.assert.calledOnceWithExactly(getAgenticUserToken, 'tenant', 'app', 'user', ['https://graph.example/.default'])
      assert.equal(fetchStub.firstCall.args[0], 'https://graph.example/v1.0/shares/u!' + Buffer.from(sharingUrl).toString('base64url') + '/driveItem/content')
      assert.equal(new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'), 'Bearer opaque-token')
      assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)

      const claims = Buffer.from(JSON.stringify({ scp: 'User.Read' })).toString('base64url')
      getAgenticUserToken.resolves('eyJhbGciOiJIUzI1NiJ9.' + claims + '.test')
      assert.deepEqual(await downloader.downloadFiles(context), [])
      sinon.assert.calledThrice(fetchStub)
    })

    it('rejects an HTTP M365 downloadUrl despite an HTTPS contentUrl when enabled', async () => {
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const context = createM365Context('http://files.example/file')
      const downloader = new M365AttachmentDownloader('inputFiles', new OutboundHostValidator({
        enabled: true, hosts: ['files.example']
      }))
      assert.deepEqual(await downloader.downloadFiles(context), [])
      sinon.assert.notCalled(fetchStub)
      sinon.assert.notCalled(lookupStub)
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

    it('isolates authenticated and signed requests across overlapping turns', async () => {
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
      first.activity.attachments![0].content = undefined
      first.activity.attachments![0].contentUrl = 'https://files.example/first'
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
        { url: 'https://files.example/other', authorization: null },
        { url: 'https://files.example/second', authorization: null }
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
})
