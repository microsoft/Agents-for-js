import { strict as assert } from 'assert'
import { describe, it } from 'node:test'
import { toSidecarConnectionSettings } from '../../src/auth/sidecar/sidecarModels'
import { AuthConfiguration } from '../../src/auth/authConfiguration'

describe('toSidecarConnectionSettings', () => {
  it('applies documented defaults when no config is provided', () => {
    const resolved = toSidecarConnectionSettings()
    assert.strictEqual(resolved.serviceName, 'default')
    assert.strictEqual(resolved.blueprintServiceName, 'agenticblueprint')
    assert.strictEqual(resolved.sidecarBaseUrl, undefined)
    assert.strictEqual(resolved.bypassLocalNetworkRestriction, false)
    assert.strictEqual(resolved.requestTimeout, 30000)
    assert.strictEqual(resolved.retryCount, 3)
    assert.strictEqual(resolved.scopes, undefined)
  })

  it('honors explicit overrides, including retryCount of 0', () => {
    const config: AuthConfiguration = {
      serviceName: 'downstream',
      blueprintServiceName: 'bp',
      sidecarBaseUrl: 'http://localhost:9000',
      bypassLocalNetworkRestriction: true,
      requestTimeout: 1234,
      retryCount: 0,
      scopes: ['s1', 's2']
    }
    const resolved = toSidecarConnectionSettings(config)
    assert.strictEqual(resolved.serviceName, 'downstream')
    assert.strictEqual(resolved.blueprintServiceName, 'bp')
    assert.strictEqual(resolved.sidecarBaseUrl, 'http://localhost:9000')
    assert.strictEqual(resolved.bypassLocalNetworkRestriction, true)
    assert.strictEqual(resolved.requestTimeout, 1234)
    // retryCount 0 must be preserved (nullish coalescing, not a falsy fallback to 3).
    assert.strictEqual(resolved.retryCount, 0)
    assert.deepStrictEqual(resolved.scopes, ['s1', 's2'])
  })

  it('falls back to defaults for whitespace-only service names', () => {
    const resolved = toSidecarConnectionSettings({ serviceName: '   ', blueprintServiceName: '  ' } as AuthConfiguration)
    assert.strictEqual(resolved.serviceName, 'default')
    assert.strictEqual(resolved.blueprintServiceName, 'agenticblueprint')
  })

  it('derives scopes from a single scope when scopes is absent', () => {
    const resolved = toSidecarConnectionSettings({ scope: 'https://graph.microsoft.com/.default' } as AuthConfiguration)
    assert.deepStrictEqual(resolved.scopes, ['https://graph.microsoft.com/.default'])
  })

  it('prefers scopes over a single scope when both are present', () => {
    const resolved = toSidecarConnectionSettings({ scope: 'single', scopes: ['a', 'b'] } as AuthConfiguration)
    assert.deepStrictEqual(resolved.scopes, ['a', 'b'])
  })
})
