import { afterEach, describe, it } from 'node:test'
import assert from 'node:assert'
import sinon from 'sinon'

import { Activity } from '@microsoft/agents-activity'
import { AttachmentDownloader } from '../../../src/app/attachmentDownloader'
import { MsalTokenProvider } from '../../../src/auth'
import { TurnContext } from '../../../src/turnContext'
import { TestAdapter } from '../testStubs'
import { JwtPayload } from 'jsonwebtoken'

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
