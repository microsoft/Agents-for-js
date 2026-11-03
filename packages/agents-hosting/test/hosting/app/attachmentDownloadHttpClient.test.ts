/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

import { strict as assert } from 'node:assert'
import { promises as dns } from 'node:dns'
import { afterEach, beforeEach, describe, it } from 'node:test'
import sinon from 'sinon'
import createDebug from 'debug'
import { AttachmentDownloadHttpClient } from '../../../src/app/attachmentDownloadHttpClient'
import { Errors } from '../../../src/errorHelper'
import { HttpClient, HttpError } from '../../../src/httpClient'
import { OutboundHostValidator, OutboundUrlPolicy } from '../../../src/outboundHostValidator'

const headers = { Authorization: 'Bearer dummy-token', 'x-initial-only': 'initial' }

function client (policy: OutboundUrlPolicy = new OutboundHostValidator({
  enabled: true,
  includeDefaultMicrosoftHosts: false,
  hosts: ['files.example', 'other.example']
})): AttachmentDownloadHttpClient {
  return new AttachmentDownloadHttpClient(new HttpClient(), policy)
}

describe('validated attachment fetching', () => {
  let lookup: sinon.SinonStub
  beforeEach(() => {
    lookup = sinon.stub(dns, 'lookup').resolves([{ address: '93.184.216.34', family: 4 }])
  })
  afterEach(() => sinon.restore())

  for (const status of [300, 301, 302, 303, 307, 308]) {
    it(`handles ${status} relative redirects without forwarding any initial headers`, async () => {
      const redirect = new Response('redirect', { status, headers: { location: '/next' } })
      const cancel = sinon.spy(redirect.body!, 'cancel')
      const fetchStub = sinon.stub(globalThis, 'fetch')
      fetchStub.onFirstCall().resolves(redirect)
      fetchStub.onSecondCall().resolves(new Response('contents'))

      const result = await client().get('https://files.example/file', headers)

      assert.equal(Buffer.from(result!.data).toString(), 'contents')
      assert.equal(fetchStub.secondCall.args[0], 'https://files.example/next')
      assert.equal(fetchStub.firstCall.args[1]?.redirect, 'manual')
      assert.equal(fetchStub.secondCall.args[1]?.redirect, 'manual')
      assert.equal(new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'), headers.Authorization)
      assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)
      assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('x-initial-only'), null)
      sinon.assert.calledOnce(cancel)
      sinon.assert.calledTwice(dns.lookup)
    })
  }

  it('does not forward credentials to an allowed cross-origin redirect', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch')
    fetchStub.onFirstCall().resolves(new Response(null, {
      status: 302, headers: { location: 'https://other.example/file' }
    }))
    fetchStub.onSecondCall().resolves(new Response('ok'))
    await client().get('https://files.example/file', headers)
    assert.equal(new Headers(fetchStub.secondCall.args[1]?.headers).get('authorization'), null)
  })

  for (const location of [
    'http://files.example/file', 'https://evil.example/file', 'https://127.0.0.1/file',
    'https://[::ffff:127.0.0.1]/file', 'https://user:password@files.example/file'
  ]) {
    it(`rejects an unsafe redirect to ${location}`, async () => {
      const redirect = new Response('redirect', { status: 302, headers: { location } })
      const cancel = sinon.spy(redirect.body!, 'cancel')
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(redirect)
      assert.equal(await client().get('https://files.example/file', headers), undefined)
      sinon.assert.calledOnce(fetchStub)
      sinon.assert.calledOnce(cancel)
    })
  }

  it('rechecks DNS when a redirect changes an allowlisted hostname to a private address', async () => {
    lookup.onFirstCall().resolves([{ address: '93.184.216.34', family: 4 }])
    lookup.onSecondCall().resolves([{ address: '169.254.169.254', family: 4 }])
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(null, {
      status: 302, headers: { location: '/next' }
    }))
    assert.equal(await client().get('https://files.example/file', headers), undefined)
    sinon.assert.calledOnce(fetchStub)
    sinon.assert.calledTwice(lookup)
  })

  for (const address of ['100.64.0.1', '::ffff:100.64.0.1']) {
    it(`rejects literal and DNS-resolved shared address ${address} before fetching`, async () => {
      const host = address.includes(':') ? `[${address}]` : address
      const policy = new OutboundHostValidator({
        enabled: true, includeDefaultMicrosoftHosts: false, hosts: [host, 'files.example']
      })
      const fetchStub = sinon.stub(globalThis, 'fetch')
      const downloader = client(policy)
      assert.equal(await downloader.get(`https://${host}/file`, headers), undefined)

      lookup.resolves([{ address, family: address.includes(':') ? 6 : 4 }])
      assert.equal(await downloader.get('https://files.example/file', headers), undefined)
      sinon.assert.notCalled(fetchStub)
    })

    it(`blocks redirect DNS resolving to shared address ${address}`, async () => {
      lookup.onSecondCall().resolves([{ address, family: address.includes(':') ? 6 : 4 }])
      const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(null, {
        status: 302, headers: { location: '/next' }
      }))
      assert.equal(await client().get('https://files.example/file', headers), undefined)
      sinon.assert.calledOnce(fetchStub)
      sinon.assert.calledTwice(lookup)
    })
  }

  it('fails closed on invalid redirect locations and cancels the intermediate body', async () => {
    const redirect = new Response('redirect', { status: 302, headers: { location: 'https://[' } })
    const cancel = sinon.spy(redirect.body!, 'cancel')
    sinon.stub(globalThis, 'fetch').resolves(redirect)
    await assert.rejects(client().get('https://files.example/file'), { code: Errors.AttachmentDownloadInvalidRedirect.code })
    sinon.assert.calledOnce(cancel)
  })

  it('limits redirects to 50 hops and disposes each redirect body', async () => {
    const cancellations: sinon.SinonSpy[] = []
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => {
      const response = new Response('redirect', { status: 302, headers: { location: '/again' } })
      cancellations.push(sinon.spy(response.body!, 'cancel'))
      return response
    })
    await assert.rejects(client().get('https://files.example/file'), { code: Errors.AttachmentDownloadRedirectLimit.code })
    assert.equal(fetchStub.callCount, 51)
    assert.equal(cancellations.length, 51)
    for (const cancel of cancellations) {
      sinon.assert.calledOnce(cancel)
    }
  })

  it('allows a successful response after exactly 50 redirect hops', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => {
      return new Response(null, { status: 302, headers: { location: '/next' } })
    })
    fetchStub.onCall(50).resolves(new Response('final'))
    const result = await client().get('https://files.example/file', headers)
    assert.equal(Buffer.from(result!.data).toString(), 'final')
    assert.equal(fetchStub.callCount, 51)
  })

  it('preserves HTTP errors when a redirect has no location', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new Response('missing location', { status: 302 }))
    await assert.rejects(client().get('https://files.example/file'), (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, 302)
      return true
    })
  })

  it('preserves HTTP errors for final non-success responses', async () => {
    sinon.stub(globalThis, 'fetch').resolves(new Response('forbidden', { status: 403 }))
    await assert.rejects(client().get('https://files.example/file'), (error: unknown) => {
      assert.ok(error instanceof HttpError)
      assert.equal(error.status, 403)
      assert.equal(Buffer.from(error.response.data as ArrayBuffer).toString(), 'forbidden')
      return true
    })
  })

  it('applies a custom enabled policy to every hop', async () => {
    const isAllowed = sinon.stub().returns(true)
    isAllowed.onSecondCall().returns(false)
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response(null, {
      status: 302, headers: { location: '/blocked' }
    }))
    assert.equal(await client({ enabled: true, isAllowed }).get('https://files.example/file'), undefined)
    sinon.assert.calledTwice(isAllowed)
    sinon.assert.calledOnce(fetchStub)
  })

  it('enforces HTTPS and address checks even when a custom policy allows everything', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch')
    const downloader = client({ enabled: true, isAllowed: () => true })
    for (const url of ['http://files.example/file', 'https://127.0.0.1/file', 'https://user:pass@files.example']) {
      assert.equal(await downloader.get(url), undefined)
    }
    sinon.assert.notCalled(fetchStub)
  })

  it('rejects private DNS answers even when a custom policy allows the hostname', async () => {
    lookup.resolves([{ address: '10.0.0.1', family: 4 }])
    const fetchStub = sinon.stub(globalThis, 'fetch')
    assert.equal(await client({ enabled: true, isAllowed: () => true }).get('https://files.example/file'), undefined)
    sinon.assert.notCalled(fetchStub)
  })

  it('permits explicitly allowlisted private HTTPS destinations without bypassing other URL checks', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').callsFake(async () => new Response('private'))
    const downloader = client(new OutboundHostValidator({
      enabled: true,
      includeDefaultMicrosoftHosts: false,
      allowPrivateNetworkAddresses: true,
      hosts: ['127.0.0.1']
    }))
    const result = await downloader.get('https://127.0.0.1/file', headers)
    assert.equal(Buffer.from(result!.data).toString(), 'private')
    assert.equal(await downloader.get('http://127.0.0.1/file'), undefined)
    assert.equal(await downloader.get('https://other.example/file'), undefined)
    assert.equal(await downloader.get('https://user:pass@127.0.0.1/file'), undefined)
    sinon.assert.calledOnce(fetchStub)
    sinon.assert.notCalled(lookup)
  })

  it('does not log credentials, signed queries, or raw DNS error details', async () => {
    const previous = createDebug.disable()
    const messages: string[] = []
    sinon.stub(createDebug, 'log').callsFake((...args: unknown[]) => {
      messages.push(args.map(String).join(' '))
    })
    createDebug.enable('agents:attachmentDownloader:*,agents:outboundHostValidator:*')
    try {
      await client().get('https://user:example-password@files.example/file?sig=example-signature', headers)
      lookup.rejects(new Error('example-dns-secret'))
      await client().get('https://files.example/file?sig=example-signature', headers)
    } finally {
      createDebug.enable(previous)
    }
    const output = messages.join('\n')
    assert.match(output, /files\.example/)
    for (const secret of ['example-password', 'example-signature', 'example-dns-secret', headers.Authorization]) {
      assert.equal(output.includes(secret), false)
    }
  })

  it('keeps disabled custom-policy decisions without adding DNS or manual redirects', async () => {
    const fetchStub = sinon.stub(globalThis, 'fetch').resolves(new Response('legacy'))
    const isAllowed = sinon.stub().returns(false)
    const downloader = client({ enabled: false, isAllowed })
    assert.equal(await downloader.get('http://localhost/file'), undefined)
    isAllowed.returns(true)
    const result = await downloader.get('http://localhost/file', headers)
    assert.equal(Buffer.from(result!.data).toString(), 'legacy')
    assert.equal(fetchStub.firstCall.args[1]?.redirect, undefined)
    assert.equal(new Headers(fetchStub.firstCall.args[1]?.headers).get('authorization'), headers.Authorization)
    sinon.assert.notCalled(dns.lookup)
  })
})
