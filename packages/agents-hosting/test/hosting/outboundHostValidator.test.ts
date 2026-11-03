// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'
import { promises as dns } from 'node:dns'
import sinon from 'sinon'
import {
  createOutboundHostValidator,
  loadOutboundHostValidatorOptionsFromEnv,
  OutboundHostValidator
} from '../../src'
import {
  createConfigurationContext,
  resetConfigurationSourcesForTest
} from '../../src/configuration/configuration'

describe('OutboundHostValidator', () => {
  const changedEnvironmentKeys = new Map<string, string | undefined>()

  function setEnvironment (key: string, value: string): void {
    if (!changedEnvironmentKeys.has(key)) {
      changedEnvironmentKeys.set(key, process.env[key])
    }
    process.env[key] = value
  }

  afterEach(() => {
    sinon.restore()
    for (const [key, value] of changedEnvironmentKeys) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    changedEnvironmentKeys.clear()
    resetConfigurationSourcesForTest()
  })

  it('creates a policy from a host-scoped configuration context', async () => {
    const configurationContext = await createConfigurationContext([{
      source: {
        name: 'outbound-hosts',
        async load () {
          return {
            format: 'document',
            value: {
              outboundHostValidator: {
                enabled: true,
                includeDefaultMicrosoftHosts: false,
                hosts: ['context.contoso.com']
              }
            }
          } as const
        }
      },
      mode: 'enforce'
    }])

    const validator = createOutboundHostValidator({ configurationContext })

    assert.equal(validator.isAllowed('https://context.contoso.com/file'), true)
    assert.equal(validator.isAllowed('https://api.botframework.com/file'), false)
  })

  it('honors a host-scoped context when constructed directly', async () => {
    const configurationContext = await createConfigurationContext([{
      source: {
        name: 'direct-outbound-hosts',
        async load () {
          return {
            format: 'document',
            value: {
              outboundHostValidator: {
                enabled: true,
                includeDefaultMicrosoftHosts: false,
                hosts: ['context.contoso.com']
              }
            }
          } as const
        }
      },
      mode: 'enforce'
    }])

    const validator = new OutboundHostValidator({ configurationContext })

    assert.equal(validator.isAllowed('https://context.contoso.com/file'), true)
    assert.equal(validator.isAllowed('https://api.botframework.com/file'), false)
  })

  function assertDisabledValidatorAllows (url: string | null): void {
    const validator = new OutboundHostValidator({ enabled: false })
    assert.equal(validator.enabled, false)
    assert.equal(validator.isAllowed(url), true)
  }

  function assertDefaultMicrosoftHostAllowed (url: string): void {
    assert.equal(new OutboundHostValidator({ enabled: true }).isAllowed(url), true)
  }

  function assertUnknownOrInvalidHostDenied (url: string): void {
    assert.equal(new OutboundHostValidator({ enabled: true }).isAllowed(url), false)
  }

  function assertHostNormalization (configuredHost: string): void {
    const validator = new OutboundHostValidator({ enabled: true, hosts: [configuredHost] })
    assert.equal(validator.isAllowed('https://contoso.com/api'), true)
    assert.equal(validator.isAllowed('https://files.contoso.com/api'), true)
    assert.equal(validator.isAllowed('https://notcontoso.com/api'), false)
    assert.equal(validator.isAllowed('https://contoso.com.evil.example/api'), false)
  }

  it('allows an external URL when enforcement is disabled', () => {
    assertDisabledValidatorAllows('https://evil.example.com/relay')
  })

  it('allows a link-local IP address when enforcement is disabled', () => {
    assertDisabledValidatorAllows('https://169.254.169.254/latest/meta-data')
  })

  it('preserves shared-network access when enforcement is disabled', () => {
    assertDisabledValidatorAllows('https://100.64.0.1/file')
    assertDisabledValidatorAllows('https://[::ffff:100.64.0.1]/file')
  })

  it('allows localhost when enforcement is disabled', () => {
    assertDisabledValidatorAllows('http://localhost/admin')
  })

  it('allows an invalid URL when enforcement is disabled', () => {
    assertDisabledValidatorAllows('not-a-uri')
  })

  it('allows an absent URL when enforcement is disabled', () => {
    assertDisabledValidatorAllows(null)
  })

  it('allows the default SMBA host', () => {
    assertDefaultMicrosoftHostAllowed('https://smba.trafficmanager.net/teams/')
  })

  it('allows the default Microsoft Graph host', () => {
    assertDefaultMicrosoftHostAllowed('https://graph.microsoft.com/v1.0/me')
  })

  it('allows the default SharePoint host', () => {
    assertDefaultMicrosoftHostAllowed('https://contoso.sharepoint.com/file')
  })

  it('allows the default svc.ms host', () => {
    assertDefaultMicrosoftHostAllowed('https://foo.svc.ms/download')
  })

  it('allows the default Azure Blob Storage host', () => {
    assertDefaultMicrosoftHostAllowed('https://account.blob.core.windows.net/container/blob')
  })

  it('allows the default Bot Framework host', () => {
    assertDefaultMicrosoftHostAllowed('https://webchat.botframework.com/callback')
  })

  it('denies an unknown external host', () => {
    assertUnknownOrInvalidHostDenied('https://evil.example.com/relay')
  })

  it('denies a link-local IP address', () => {
    assertUnknownOrInvalidHostDenied('https://169.254.169.254/latest/meta-data')
  })

  it('denies an internal hostname', () => {
    assertUnknownOrInvalidHostDenied('https://internal-test.local:8443/secret')
  })

  it('denies localhost', () => {
    assertUnknownOrInvalidHostDenied('http://localhost/admin')
  })

  it('denies a non-allowlisted trafficmanager.net host', () => {
    assertUnknownOrInvalidHostDenied('https://evil.trafficmanager.net/relay')
  })

  it('denies an invalid URL', () => {
    assertUnknownOrInvalidHostDenied('not-a-uri')
  })

  it('denies a relative URL', () => {
    assertUnknownOrInvalidHostDenied('/relative/path')
  })

  it('normalizes a full host URL', () => {
    assertHostNormalization('https://contoso.com')
  })

  it('normalizes a full host URL with a path', () => {
    assertHostNormalization('https://contoso.com/some/path')
  })

  it('normalizes a host with a port', () => {
    assertHostNormalization('contoso.com:8443')
  })

  it('normalizes a host with a path', () => {
    assertHostNormalization('contoso.com/path')
  })

  it('normalizes a wildcard host', () => {
    assertHostNormalization('*.contoso.com')
  })

  it('can exclude the default Microsoft hosts', () => {
    const validator = new OutboundHostValidator({
      enabled: true,
      includeDefaultMicrosoftHosts: false,
      hosts: ['contoso.com']
    })

    assert.equal(validator.isAllowed('https://graph.microsoft.com/v1.0/me'), false)
    assert.equal(validator.isAllowed('https://contoso.com/x'), true)
  })

  it('loads scalar and indexed settings from environment variables case-insensitively', () => {
    setEnvironment('OUTBOUNDHOSTVALIDATOR__ENABLED', 'true')
    setEnvironment('OutboundHostValidator__IncludeDefaultMicrosoftHosts', 'false')
    setEnvironment('OutboundHostValidator__Hosts__1', 'fabrikam.com')
    setEnvironment('OutboundHostValidator__Hosts__0', 'contoso.com')

    const options = loadOutboundHostValidatorOptionsFromEnv()
    assert.deepEqual(options, {
      enabled: true,
      includeDefaultMicrosoftHosts: false,
      hosts: ['contoso.com', 'fabrikam.com']
    })

    const validator = createOutboundHostValidator()
    assert.equal(validator.isAllowed('https://api.contoso.com'), true)
    assert.equal(validator.isAllowed('https://graph.microsoft.com'), false)
  })

  it('requires HTTPS and rejects userinfo even for allowlisted hosts', () => {
    const validator = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
    for (const url of [
      'http://files.example/file', 'ftp://files.example/file',
      'https://user:secret@files.example/file', 'https://user@files.example/file'
    ]) {
      assert.equal(validator.isAllowed(url), false)
    }
  })

  for (const host of [
    '127.0.0.1', '10.1.2.3', '169.254.169.254', '0.0.0.0', '[::]', '[::1]',
    '[fd12::1]', '[fe80::1]', '[::ffff:127.0.0.1]', 'localhost',
    '100.64.0.0', '100.64.0.1', '100.127.255.255',
    '[::ffff:100.64.0.1]', '[::ffff:100.127.255.255]'
  ]) {
    it(`blocks allowlisted private address ${host} unless explicitly permitted`, async () => {
      const lookup = sinon.stub(dns, 'lookup')
      const options = { enabled: true, includeDefaultMicrosoftHosts: false, hosts: [host] }
      const url = `https://${host}/file`
      const restricted = new OutboundHostValidator(options)
      assert.equal(restricted.isAllowed(url), false)
      assert.equal(await restricted.isAllowedAsync(url), false)

      const permissive = new OutboundHostValidator({ ...options, allowPrivateNetworkAddresses: true })
      assert.equal(await permissive.isAllowedAsync(url), true)
      assert.equal(permissive.isAllowed(`http://${host}/file`), false)
      assert.equal(permissive.isAllowed('https://not-allowlisted.example/file'), false)
      sinon.assert.notCalled(lookup)
    })
  }

  it('normalizes unusual IPv4 URL literals before checking addresses', () => {
    const validator = new OutboundHostValidator({
      enabled: true, hosts: ['127.0.0.1', '0.0.0.0']
    })
    for (const url of ['https://2130706433/', 'https://0x7f000001/', 'https://127.1/', 'https://0/']) {
      assert.equal(validator.isAllowed(url), false)
    }
  })

  for (const addresses of [
    [{ address: '10.0.0.1', family: 4 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '::1', family: 6 }],
    [{ address: '::ffff:169.254.169.254', family: 6 }],
    [{ address: '100.64.0.1', family: 4 }],
    [{ address: '::ffff:100.64.0.1', family: 6 }],
    [{ address: '93.184.216.34', family: 4 }, { address: '100.127.255.255', family: 4 }],
    [{ address: '::', family: 6 }],
    []
  ]) {
    it(`rejects unsafe or empty DNS answers ${JSON.stringify(addresses)}`, async () => {
      sinon.stub(dns, 'lookup').resolves(addresses)
      const validator = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
      assert.equal(await validator.isAllowedAsync('https://files.example/file'), false)
    })
  }

  it('allows DNS names only when all resolved addresses pass validation', async () => {
    const lookup = sinon.stub(dns, 'lookup').resolves([
      { address: '93.184.216.34', family: 4 },
      { address: '2001:4860:4860::8888', family: 6 }
    ])
    const validator = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
    assert.equal(await validator.isAllowedAsync('https://files.example/file'), true)
    sinon.assert.calledOnceWithExactly(lookup, 'files.example', { all: true })
  })

  it('does not block DNS answers immediately outside RFC 6598 shared space', async () => {
    sinon.stub(dns, 'lookup').resolves([
      { address: '100.63.255.255', family: 4 },
      { address: '100.128.0.0', family: 4 },
      { address: '::ffff:100.63.255.255', family: 6 },
      { address: '::ffff:100.128.0.0', family: 6 }
    ])
    const validator = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
    assert.equal(await validator.isAllowedAsync('https://files.example/file'), true)
  })

  it('fails closed on DNS errors and skips DNS entirely while disabled', async () => {
    const lookup = sinon.stub(dns, 'lookup').rejects()
    const validator = new OutboundHostValidator({ enabled: true, hosts: ['files.example'] })
    assert.equal(await validator.isAllowedAsync('https://files.example/file'), false)
    sinon.assert.calledOnce(lookup)
    lookup.resetHistory()
    assert.equal(await new OutboundHostValidator().isAllowedAsync('not-a-url'), true)
    sinon.assert.notCalled(lookup)
  })

  it('loads the private-network exception from environment configuration', () => {
    setEnvironment('OUTBOUNDHOSTVALIDATOR__ALLOWPRIVATENETWORKADDRESSES', 'true')
    const validator = createOutboundHostValidator({ enabled: true, hosts: ['127.0.0.1'] })
    assert.equal(validator.isAllowed('https://127.0.0.1/file'), true)
    assert.equal(createOutboundHostValidator({
      enabled: true, hosts: ['127.0.0.1'], allowPrivateNetworkAddresses: false
    }).isAllowed('https://127.0.0.1/file'), false)
  })

  for (const mode of ['fallback', 'overrideEnvironment', 'enforce'] as const) {
    it(`resolves the private-network exception through ${mode} precedence`, async () => {
      setEnvironment('OutboundHostValidator__AllowPrivateNetworkAddresses', 'false')
      const configurationContext = await createConfigurationContext([{
        mode,
        source: {
          name: 'private-networks',
          async load () {
            return { format: 'document', value: { outboundHostValidator: { allowPrivateNetworkAddresses: true } } } as const
          }
        }
      }])
      const options = { enabled: true, hosts: ['127.0.0.1'], configurationContext }
      assert.equal(
        createOutboundHostValidator(options).isAllowed('https://127.0.0.1/file'),
        mode !== 'fallback'
      )
      assert.equal(
        createOutboundHostValidator({ ...options, allowPrivateNetworkAddresses: false }).isAllowed('https://127.0.0.1/file'),
        mode === 'enforce'
      )
    })
  }

  it('accepts the canonical private-network setting in an isolated host context', async () => {
    const configurationContext = await createConfigurationContext([{
      mode: 'enforce',
      source: {
        name: 'canonical-private-network',
        async load () {
          return { format: 'canonical', values: { 'outboundHostValidator.allowPrivateNetworkAddresses': 'true' } } as const
        }
      }
    }])
    assert.equal(new OutboundHostValidator({
      enabled: true, hosts: ['127.0.0.1'], configurationContext
    }).isAllowed('https://127.0.0.1/file'), true)
    assert.equal(new OutboundHostValidator({
      enabled: true, hosts: ['127.0.0.1']
    }).isAllowed('https://127.0.0.1/file'), false)
  })

  it('rejects invalid private-network booleans from external documents', async () => {
    await assert.rejects(createConfigurationContext([{
      mode: 'enforce',
      source: {
        name: 'invalid-private-network',
        async load () {
          return { format: 'document', value: { outboundHostValidator: { allowPrivateNetworkAddresses: 'yes' } } } as const
        }
      }
    }]), /invalid boolean/)
  })
})
