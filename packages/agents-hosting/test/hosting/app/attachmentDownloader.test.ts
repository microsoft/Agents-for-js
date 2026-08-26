import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'

import { Activity } from '@microsoft/agents-activity'
import { AttachmentDownloader } from '../../../src/app/attachmentDownloader'
import { MsalTokenProvider } from '../../../src/auth'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'
import { JwtPayload } from 'jsonwebtoken'
import { M365AttachmentDownloader, OutboundHostValidator } from '../../../src'

function createContext (identity?: JwtPayload) {
  const adapter = new TestAdapter()
  const activity = Activity.fromObject({
    type: 'message',
    channelId: 'test',
    serviceUrl: 'https://service.example',
    attachments: [{
      contentType: 'text/plain',
      contentUrl: 'https://files.example/file.txt'
    }]
  })

  return new TurnContext(adapter, activity, identity)
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

  it('downloads an attachment from an allowed host using native fetch redirect handling', async () => {
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
    assert.equal(fetchStub.firstCall.args[1]?.redirect, undefined)
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
