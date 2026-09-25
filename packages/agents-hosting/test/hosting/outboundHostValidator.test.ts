// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

import { strict as assert } from 'node:assert'
import { afterEach, describe, it } from 'node:test'
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
    if (!changedEnvironmentKeys.has(key)) changedEnvironmentKeys.set(key, process.env[key])
    process.env[key] = value
  }

  afterEach(() => {
    for (const [key, value] of changedEnvironmentKeys) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
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
})
