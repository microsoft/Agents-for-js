import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { AuthConfiguration, getAuthConfigWithDefaults, loadAuthConfigFromEnv, loadPrevAuthConfigFromEnv, resolveAuthority } from '../../src'
import { AuthType, envParser, envParserUtils, resolveAuthType } from '../../src/auth/settings'

describe('AuthConfiguration', () => {
  let originalEnv: NodeJS.ProcessEnv
  let originalTestMode: string | undefined

  beforeEach(() => {
    // Store original environment variables
    originalEnv = { ...process.env }
    originalTestMode = process.env.TEST_MODE

    // Reset environment variables before each test
    process.env.TEST_MODE = 'true'
    process.env.tenantId = 'test-tenant-id'
    process.env.clientId = 'test-client-id'
    process.env.clientSecret = 'test-client-secret'
    process.env.certPemFile = 'test-cert.pem'
    process.env.certKeyFile = 'test-cert.key'
    process.env.connectionName = 'test-connection'
    process.env.FICClientId = 'test-fic-client-id'
    process.env.authorityEndpoint = 'https://login.microsoftonline.com'
    process.env.idpmResource = 'https://test.uri.com'
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv
    process.env.TEST_MODE = originalTestMode
  })

  it('should re-export parser utilities from public surface', () => {
    assert.strictEqual(typeof envParser, 'function')
    assert.strictEqual(typeof envParserUtils.bypass, 'function')
  })

  describe('loadAuthConfigFromEnv without connection name', () => {
    it('should load configuration from environment variables', () => {
      const config: AuthConfiguration = loadAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, 'test-tenant-id')
      assert.strictEqual(config.clientId, 'test-client-id')
      assert.strictEqual(config.clientSecret, 'test-client-secret')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.federatedClientId, 'test-fic-client-id')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, 'https://test.uri.com')
    })

    it('should throw an error if clientId is not provided in production', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.clientId
      assert.throws(() => loadAuthConfigFromEnv(), /ClientId required in production/)
    })

    it('should allow missing clientId in development environment', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.clientId
      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.clientId, undefined)
    })

    it('should handle missing optional environment variables', () => {
      delete process.env.tenantId
      delete process.env.clientSecret
      delete process.env.certPemFile
      delete process.env.certKeyFile
      delete process.env.connectionName
      delete process.env.FICClientId
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, undefined)
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.certPemFile, undefined)
      assert.strictEqual(config.certKeyFile, undefined)
      assert.strictEqual(config.connectionName, undefined)
      assert.strictEqual(config.federatedClientId, undefined)
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/botframework.com/',
        'https://login.microsoftonline.com/botframework.com/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, undefined)
    })
  })

  describe('loadAuthConfigFromEnv with connection name', () => {
    beforeEach(() => {
      // Set up connection-specific environment variables
      process.env.myconn_tenantId = 'conn-tenant-id'
      process.env.myconn_clientId = 'conn-client-id'
      process.env.myconn_clientSecret = 'conn-client-secret'
      process.env.myconn_certPemFile = 'conn-cert.pem'
      process.env.myconn_certKeyFile = 'conn-cert.key'
      process.env.myconn_connectionName = 'conn-connection-name'
      process.env.myconn_authorityEndpoint = 'https://login.microsoftonline.com'
      process.env.myconn_idpmResource = 'https://test.uri.com'
    })

    it('should load configuration from connection-specific environment variables', () => {
      const config = loadAuthConfigFromEnv('myconn')
      assert.strictEqual(config.tenantId, 'conn-tenant-id')
      assert.strictEqual(config.clientId, 'conn-client-id')
      assert.strictEqual(config.clientSecret, 'conn-client-secret')
      assert.strictEqual(config.certPemFile, 'conn-cert.pem')
      assert.strictEqual(config.certKeyFile, 'conn-cert.key')
      assert.strictEqual(config.connectionName, 'conn-connection-name')
      assert.strictEqual(config.federatedClientId, undefined) // Falls back to global federatedClientId
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/conn-tenant-id/',
        'https://login.microsoftonline.com/conn-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, 'https://test.uri.com')
    })

    it('should throw an error if connection-specific clientId is not found', () => {
      assert.throws(() => loadAuthConfigFromEnv('nonexistent'), /ClientId not found for connection: nonexistent/)
    })

    it('should handle missing optional connection-specific environment variables', () => {
      process.env.minimal_clientId = 'minimal-client-id'

      const config = loadAuthConfigFromEnv('minimal')
      assert.strictEqual(config.tenantId, undefined)
      assert.strictEqual(config.clientId, 'minimal-client-id')
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.certPemFile, undefined)
      assert.strictEqual(config.certKeyFile, undefined)
      assert.strictEqual(config.connectionName, undefined)
      assert.strictEqual(config.federatedClientId, undefined)
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/botframework.com/',
        'https://login.microsoftonline.com/botframework.com/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, undefined)
    })
  })

  describe('loadPrevAuthConfigFromEnv', () => {
    beforeEach(() => {
      // Set up Microsoft App environment variables
      process.env.MicrosoftAppId = 'microsoft-app-id'
      process.env.MicrosoftAppPassword = 'microsoft-app-password'
      process.env.MicrosoftAppTenantId = 'microsoft-tenant-id'
      process.env.MicrosoftAppClientId = 'microsoft-app-client-id'
      process.env.idpmResource = 'https://test.uri.com'
    })

    it('should load configuration from Microsoft App environment variables', () => {
      const config = loadPrevAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, 'microsoft-tenant-id')
      assert.strictEqual(config.clientId, 'microsoft-app-id')
      assert.strictEqual(config.clientSecret, 'microsoft-app-password')
      assert.strictEqual(config.federatedClientId, 'microsoft-app-client-id')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/microsoft-tenant-id/',
        'https://login.microsoftonline.com/microsoft-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, 'https://test.uri.com')
    })

    it('should throw an error if MicrosoftAppId is not provided in production', () => {
      process.env.NODE_ENV = 'production'
      delete process.env.MicrosoftAppId
      assert.throws(() => loadPrevAuthConfigFromEnv(), /ClientId required in production/)
    })

    it('should allow missing MicrosoftAppId in development environment', () => {
      process.env.NODE_ENV = 'development'
      delete process.env.MicrosoftAppId
      const config = loadPrevAuthConfigFromEnv()
      assert.strictEqual(config.clientId, undefined)
    })

    it('should handle missing optional Microsoft App environment variables', () => {
      delete process.env.MicrosoftAppPassword
      delete process.env.MicrosoftAppTenantId
      delete process.env.MicrosoftAppClientId
      delete process.env.certPemFile
      delete process.env.certKeyFile
      delete process.env.connectionName
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const config = loadPrevAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, undefined)
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.federatedClientId, undefined)
      assert.strictEqual(config.certPemFile, undefined)
      assert.strictEqual(config.certKeyFile, undefined)
      assert.strictEqual(config.connectionName, undefined)
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/botframework.com/',
        'https://login.microsoftonline.com/botframework.com/v2.0'
      ])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, undefined)
    })
  })

  describe('getAuthConfigWithDefaults', () => {
    it('should populate altBlueprintConnectionName from the alternateBlueprintConnectionName alias', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const customConfig: AuthConfiguration = {
        clientId: 'custom-test-client',
        clientSecret: 'custom-test-secret',
        tenantId: 'custom-test-tenant',
        issuers: ['https://example.com'],
        alternateBlueprintConnectionName: 'alt-alias-connection'
      }
      const config: AuthConfiguration = getAuthConfigWithDefaults(customConfig)
      assert.strictEqual(config.altBlueprintConnectionName, 'alt-alias-connection')
      assert.strictEqual(config.alternateBlueprintConnectionName, 'alt-alias-connection')
    })

    it('should prefer altBlueprintConnectionName over the alternateBlueprintConnectionName alias when both are set', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const customConfig: AuthConfiguration = {
        clientId: 'custom-test-client',
        clientSecret: 'custom-test-secret',
        tenantId: 'custom-test-tenant',
        issuers: ['https://example.com'],
        altBlueprintConnectionName: 'canonical-connection',
        alternateBlueprintConnectionName: 'alias-connection'
      }
      const config: AuthConfiguration = getAuthConfigWithDefaults(customConfig)
      assert.strictEqual(config.altBlueprintConnectionName, 'canonical-connection')
      assert.strictEqual(config.alternateBlueprintConnectionName, 'canonical-connection')
    })

    it('should load altBlueprintConnectionName from the alternateBlueprintConnectionName env alias', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource
      process.env.alternateBlueprintConnectionName = 'env-alias-connection'

      const config: AuthConfiguration = loadAuthConfigFromEnv()
      assert.strictEqual(config.altBlueprintConnectionName, 'env-alias-connection')
    })

    it('should load configuration with defaults', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const customConfig: AuthConfiguration = {
        clientId: 'custom-test-client',
        clientSecret: 'custom-test-secret',
        tenantId: 'custom-test-tenant',
        issuers: ['https://example.com'],
        altBlueprintConnectionName: 'blue-connection'
      }
      const config: AuthConfiguration = getAuthConfigWithDefaults(customConfig)
      assert.strictEqual(config.tenantId, 'custom-test-tenant')
      assert.strictEqual(config.clientId, 'custom-test-client')
      assert.strictEqual(config.clientSecret, 'custom-test-secret')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.federatedClientId, 'test-fic-client-id')
      assert.deepStrictEqual(config.issuers, ['https://example.com'])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.altBlueprintConnectionName, 'blue-connection')
      assert.strictEqual(config.idpmResource, undefined)
      assert.strictEqual(config.connections?.size, 1)
      assert.strictEqual(config.connectionsMap?.length, 1)
      assert.notStrictEqual(config.connections?.get('serviceConnection'), config)
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'custom-test-client')
    })

    it('should load configuration with connections', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const connections = new Map<string, AuthConfiguration>()
      connections.set('test-conn', { clientId: 'custom-test-client', clientSecret: 'custom-test-secret', tenantId: 'custom-test-tenant' })

      const customConfig: AuthConfiguration = {
        connections,
        connectionsMap: [{ connection: 'test-conn', serviceUrl: '*' }]
      }
      const config: AuthConfiguration = getAuthConfigWithDefaults(customConfig)
      assert.strictEqual(config.tenantId, 'custom-test-tenant')
      assert.strictEqual(config.clientId, 'custom-test-client')
      assert.strictEqual(config.clientSecret, 'custom-test-secret')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.federatedClientId, 'test-fic-client-id')
      assert.deepStrictEqual(config.issuers?.length, 3)
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.strictEqual(config.idpmResource, undefined)
      assert.strictEqual(config.altBlueprintConnectionName, undefined)
      assert.strictEqual(config.connections?.size, 1)
      assert.strictEqual(config.connectionsMap?.length, 1)
      assert.strictEqual(config.connectionsMap[0].connection, 'test-conn')
    })

    it('should load from env with defaults', () => {
      delete process.env.authorityEndpoint
      delete process.env.idpmResource

      const config: AuthConfiguration = getAuthConfigWithDefaults()
      assert.strictEqual(config.tenantId, 'test-tenant-id')
      assert.strictEqual(config.clientId, 'test-client-id')
      assert.strictEqual(config.clientSecret, 'test-client-secret')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.federatedClientId, 'test-fic-client-id')
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
      assert.strictEqual(config.altBlueprintConnectionName, undefined)
      assert.strictEqual(config.idpmResource, undefined)
      assert.strictEqual(config.connections?.size, 1)
      assert.strictEqual(config.connectionsMap?.length, 1)
    })
  })

  describe('resolveAuthority', () => {
    it('should return authority as-is when tenant is embedded (no trailing slash)', () => {
      assert.strictEqual(
        resolveAuthority('https://login.microsoftonline.com/my-tenant'),
        'https://login.microsoftonline.com/my-tenant'
      )
    })

    it('should strip trailing slash when tenant is embedded', () => {
      assert.strictEqual(
        resolveAuthority('https://login.microsoftonline.com/my-tenant/'),
        'https://login.microsoftonline.com/my-tenant'
      )
    })

    it('should append tenantId when authority has no path segment', () => {
      assert.strictEqual(
        resolveAuthority('https://login.microsoftonline.com', 'my-tenant'),
        'https://login.microsoftonline.com/my-tenant'
      )
    })

    it('should append tenantId when authority has trailing slash and no path segment', () => {
      assert.strictEqual(
        resolveAuthority('https://login.microsoftonline.com/', 'my-tenant'),
        'https://login.microsoftonline.com/my-tenant'
      )
    })

    it('should use default authority when none provided, appending tenantId', () => {
      assert.strictEqual(
        resolveAuthority(undefined, 'my-tenant'),
        'https://login.microsoftonline.com/my-tenant'
      )
    })

    it('should use botframework.com as default when no tenantId is provided', () => {
      assert.strictEqual(
        resolveAuthority(),
        'https://login.microsoftonline.com/botframework.com'
      )
    })
  })

  describe('resolveAuthType', () => {
    it('should resolve auth type through the shared MSAL auth type helper', () => {
      assert.strictEqual(resolveAuthType(undefined), 'none')
      assert.strictEqual(resolveAuthType({ clientSecret: 'secret' }), AuthType.ClientSecret)
      assert.strictEqual(resolveAuthType({ WIDAssertionFile: 'token-file', clientSecret: 'secret' }), AuthType.WorkloadIdentity)
      assert.strictEqual(resolveAuthType({ certPemFile: 'cert.pem', certKeyFile: 'key.pem' }), AuthType.Certificate)
      assert.strictEqual(resolveAuthType({ authType: 'Certificate' }), AuthType.Certificate)
    })
  })

  describe('azureRegion', () => {
    describe('with connections env vars', () => {
      beforeEach(() => {
        process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
        process.env['connectionsMap__0__serviceUrl'] = '*'
        process.env['connectionsMap__0__connection'] = 'serviceConnection'
      })

      it('should load azureRegion from connections env var', () => {
        process.env['connections__serviceConnection__settings__azureRegion'] = 'westus'
        const config = loadAuthConfigFromEnv()
        assert.strictEqual(config.azureRegion, 'westus')
      })

      it('should leave azureRegion undefined when not set in connections', () => {
        const config = loadAuthConfigFromEnv()
        assert.strictEqual(config.azureRegion, undefined)
      })
    })

    it('should load azureRegion from legacy env var', () => {
      process.env.azureRegion = 'eastus'
      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.azureRegion, 'eastus')
      delete process.env.azureRegion
    })
  })

  describe('connections env parsing', () => {
    it('should preserve explicit connections map entries from env', () => {
      process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'serviceConnection'
      process.env['connectionsMap__1__serviceUrl'] = 'https://service.example'
      process.env['connectionsMap__1__connection'] = 'serviceConnection'
      process.env['connectionsMap__1__audience'] = 'aud-1'

      const config = loadAuthConfigFromEnv()

      assert.deepStrictEqual(config.connectionsMap, [
        {
          serviceUrl: '*',
          connection: 'serviceConnection'
        },
        {
          serviceUrl: 'https://service.example',
          connection: 'serviceConnection',
          audience: 'aud-1'
        }
      ])
    })

    it('should preserve all env-defined connections', () => {
      process.env['connections__first__settings__clientId'] = 'cid-1'
      process.env['connections__second__settings__clientId'] = 'cid-2'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'second'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.connections?.size, 2)
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])].sort(), ['first', 'second'])
      assert.strictEqual(config.connectionsMap?.[0]?.connection, 'second')
    })

    it('should preserve a wildcard map that points to a custom connection without synthesizing serviceConnection', () => {
      process.env['connections__custom__settings__clientId'] = 'cid-custom'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'custom'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.connections?.size, 1)
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])], ['custom'])
      assert.strictEqual(config.connections?.has('serviceConnection'), false)
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'custom' }])
    })

    it('should throw the legacy default-connection error when latest-format config has no wildcard mapping', () => {
      process.env['connections__first__settings__clientId'] = 'cid-1'
      process.env['connectionsMap__0__serviceUrl'] = 'https://service.example'
      process.env['connectionsMap__0__connection'] = 'first'

      assert.throws(
        () => loadAuthConfigFromEnv(),
        /No default connection found in environment connections\./
      )
    })

    it('should parse AuthorityEndpoint and FederatedClientId aliases in latest connections format', () => {
      process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
      process.env['connections__serviceConnection__settings__AuthorityEndpoint'] = 'https://login.microsoftonline.com/custom-tenant'
      process.env['connections__serviceConnection__settings__FederatedClientId'] = 'federated-client-id'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'serviceConnection'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com/custom-tenant')
      assert.strictEqual(config.federatedClientId, 'federated-client-id')
    })

    it('should parse Scopes alias in latest connections format and preserve the first scope alias', () => {
      process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
      process.env['connections__serviceConnection__settings__Scopes'] = 'https://api.botframework.com https://graph.microsoft.com'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'serviceConnection'

      const config = loadAuthConfigFromEnv()

      assert.deepStrictEqual(config.scopes, ['https://api.botframework.com', 'https://graph.microsoft.com'])
    })

    it('should expose deprecated scope as the first scopes entry', () => {
      process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
      process.env['connections__serviceConnection__settings__Scopes'] = 'https://api.botframework.com https://graph.microsoft.com'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'serviceConnection'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.scope, 'https://api.botframework.com')
    })

    it('should ignore malformed latest-format connection keys without throwing', () => {
      process.env['connections__serviceConnection__settings'] = 'ignored'

      assert.doesNotThrow(() => loadAuthConfigFromEnv())
      assert.strictEqual(loadAuthConfigFromEnv().clientId, 'test-client-id')
    })

    it('should ignore latest-format connection keys with extra segments without throwing', () => {
      process.env['connections__serviceConnection__settings__clientId__extra'] = 'ignored'

      assert.doesNotThrow(() => loadAuthConfigFromEnv())
      assert.strictEqual(loadAuthConfigFromEnv().clientId, 'test-client-id')
    })

    it('should ignore malformed latest-format connectionsMap keys without throwing', () => {
      process.env['connectionsMap__0'] = 'ignored'

      assert.doesNotThrow(() => loadAuthConfigFromEnv())
      assert.strictEqual(loadAuthConfigFromEnv().clientId, 'test-client-id')
    })

    it('should ignore latest-format connectionsMap keys with extra segments without throwing', () => {
      process.env['connectionsMap__0__serviceUrl__extra'] = 'ignored'

      assert.doesNotThrow(() => loadAuthConfigFromEnv())
      assert.strictEqual(loadAuthConfigFromEnv().clientId, 'test-client-id')
    })
  })

  describe('AuthConfiguration interface', () => {
    it('should allow creating a valid AuthConfiguration object', () => {
      const config: AuthConfiguration = {
        tenantId: 'test-tenant',
        clientId: 'test-client',
        clientSecret: 'test-secret',
        certPemFile: 'cert.pem',
        certKeyFile: 'cert.key',
        connectionName: 'test-connection',
        federatedClientId: 'fic-client',
        issuers: ['https://example.com'],
        authorityEndpoint: 'https://login.microsoftonline.us',
        scopes: ['https://api.botframework.com'],
        idpmResource: 'https://test.uri.com'
      }

      assert.strictEqual(config.tenantId, 'test-tenant')
      assert.strictEqual(config.clientId, 'test-client')
      assert.strictEqual(config.clientSecret, 'test-secret')
      assert.strictEqual(config.certPemFile, 'cert.pem')
      assert.strictEqual(config.certKeyFile, 'cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.federatedClientId, 'fic-client')
      assert.deepStrictEqual(config.issuers, ['https://example.com'])
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.us')
      assert.deepStrictEqual(config.scopes, ['https://api.botframework.com'])
      assert.strictEqual(config.idpmResource, 'https://test.uri.com')
    })

    it('should allow creating minimal AuthConfiguration with only required fields', () => {
      const config: AuthConfiguration = {
        clientId: 'test-client',
        issuers: ['https://api.botframework.com']
      }

      assert.deepStrictEqual(config.issuers, ['https://api.botframework.com'])
      assert.strictEqual(config.clientId, 'test-client')
      assert.strictEqual(config.tenantId, undefined)
    })
  })
})
