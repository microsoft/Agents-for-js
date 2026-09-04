import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { AuthConfiguration, getAuthConfigWithDefaults, loadAuthConfigFromEnv, loadPrevAuthConfigFromEnv, resolveAuthority } from '../../src'
import {
  AuthType,
  envParser,
  envParserUtils,
  type LoadEnv,
  loadEnvSettings,
  resolveAuthType
} from '../../src/auth/settings'
import {
  createConfigurationContext,
  preloadConfigurationSources,
  resetConfigurationSourcesForTest
} from '../../src/configuration/configuration'
import { Errors } from '../../src/errorHelper'
import {
  envParser as sharedEnvParser,
  envParserUtils as sharedEnvParserUtils,
  loadEnvSettings as sharedLoadEnvSettings
} from '../../src/utils/env'

describe('AuthConfiguration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    resetConfigurationSourcesForTest()
    originalEnv = process.env
    process.env = {
      TEST_MODE: 'true',
      NODE_ENV: 'development',
      tenantId: 'test-tenant-id',
      clientId: 'test-client-id',
      clientSecret: 'test-client-secret',
      certPemFile: 'test-cert.pem',
      certKeyFile: 'test-cert.key',
      connectionName: 'test-connection',
      FICClientId: 'test-fic-client-id',
      authorityEndpoint: 'https://login.microsoftonline.com',
      idpmResource: 'https://test.uri.com'
    }
  })

  afterEach(() => {
    process.env = originalEnv
    resetConfigurationSourcesForTest()
  })

  it('should preserve auth/settings parser imports as direct compatibility re-exports', () => {
    assert.strictEqual(envParser, sharedEnvParser)
    assert.strictEqual(envParserUtils, sharedEnvParserUtils)
    assert.strictEqual(loadEnvSettings, sharedLoadEnvSettings)
    const indexed: LoadEnv = loadEnvSettings(() => {}, { Existing_Key: 'value' })
    assert.deepEqual(indexed.EXISTING_KEY, { key: 'Existing_Key', value: 'value' })
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
      assert.strictEqual(config.validateIssuer, undefined)
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

    it('should enable issuer validation explicitly from the environment', () => {
      process.env.validateIssuer = 'true'
      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.validateIssuer, true)
    })

    it('should parse supported boolean forms for issuer validation', () => {
      process.env.validateIssuer = ' 1 '
      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.validateIssuer, true)
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

  describe('configuration source behavior', () => {
    it('should load modern connections env without inheriting legacy flat env', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        clientId: 'legacy-client-id',
        clientSecret: 'legacy-client-secret',
        Connections__modern__Settings__TenantId: 'modern-tenant-id',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        Connections__modern__Settings__ClientSecret: 'modern-client-secret',
        Connections__modern__Settings__Authority: 'https://login.microsoftonline.us',
        Connections__modern__Settings__FICClientId: 'modern-federated-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.tenantId, 'modern-tenant-id')
      assert.strictEqual(config.clientId, 'modern-client-id')
      assert.strictEqual(config.clientSecret, 'modern-client-secret')
      assert.strictEqual(config.federatedClientId, 'modern-federated-client-id')
      assert.strictEqual(config.FICClientId, 'modern-federated-client-id')
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.us')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.us',
        'https://sts.windows.net/modern-tenant-id/',
        'https://login.microsoftonline.us/modern-tenant-id/v2.0'
      ])
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'modern' }])
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])], ['modern'])
    })

    it('should preserve modern environment registry identity across repeated loads', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }

      const first = loadAuthConfigFromEnv()
      const second = loadAuthConfigFromEnv()

      assert.strictEqual(second.connections, first.connections)
      assert.strictEqual(second.connectionsMap, first.connectionsMap)
      assert.strictEqual(second.connections?.get('modern')?.clientId, 'modern-client-id')
    })

    it('should preserve environment registry identity with a non-auth configuration context', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }
      const configurationContext = await createConfigurationContext([{
        source: {
          name: 'adapter-options-only',
          async load () {
            return {
              format: 'document',
              value: {
                cloudAdapterOptions: {
                  emitStackTrace: true
                }
              }
            } as const
          }
        },
        mode: 'overrideEnvironment'
      }])

      const first = loadAuthConfigFromEnv(undefined, { configurationContext })
      const second = loadAuthConfigFromEnv(undefined, { configurationContext })

      assert.strictEqual(second.connections, first.connections)
      assert.strictEqual(second.connectionsMap, first.connectionsMap)
      assert.strictEqual(second.connections?.get('modern')?.clientId, 'modern-client-id')
    })

    it('should not let a direct registry mutate the memoized environment registry', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }
      const directConnections = new Map<string, AuthConfiguration>([
        ['direct', { clientId: 'direct-client-id' }]
      ])

      const direct = getAuthConfigWithDefaults({
        connections: directConnections,
        connectionsMap: [{ serviceUrl: '*', connection: 'direct' }]
      })
      const environment = loadAuthConfigFromEnv()

      assert.strictEqual(direct.connections, directConnections)
      assert.strictEqual(environment.clientId, 'modern-client-id')
      assert.deepStrictEqual([...(environment.connections?.keys() ?? [])], ['modern'])
    })

    it('should apply defaults to direct flat JSON without environment configuration', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const directConfig = JSON.parse(JSON.stringify({
        tenantId: 'direct-tenant-id',
        clientId: 'direct-client-id',
        clientSecret: 'direct-client-secret'
      })) as AuthConfiguration

      const config = getAuthConfigWithDefaults(directConfig)

      assert.strictEqual(config.clientId, 'direct-client-id')
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.com')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/direct-tenant-id/',
        'https://login.microsoftonline.com/direct-tenant-id/v2.0'
      ])
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'serviceConnection' }])
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'direct-client-id')
    })

    it('should use direct connections JSON and its wildcard connection', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const directJson = JSON.parse(JSON.stringify({
        connections: {
          primary: {
            tenantId: 'primary-tenant-id',
            clientId: 'primary-client-id'
          },
          secondary: {
            tenantId: 'secondary-tenant-id',
            clientId: 'secondary-client-id'
          }
        },
        connectionsMap: [
          { serviceUrl: 'https://secondary.example', connection: 'secondary' },
          { serviceUrl: '*', connection: 'primary' }
        ]
      })) as {
        connections: Record<string, AuthConfiguration>
        connectionsMap: NonNullable<AuthConfiguration['connectionsMap']>
      }
      const directConfig: AuthConfiguration = {
        connections: new Map(Object.entries(directJson.connections)),
        connectionsMap: directJson.connectionsMap
      }

      const config = getAuthConfigWithDefaults(directConfig)

      assert.strictEqual(config.clientId, 'primary-client-id')
      assert.strictEqual(config.tenantId, 'primary-tenant-id')
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])], ['primary', 'secondary'])
      assert.deepStrictEqual(config.connectionsMap, directJson.connectionsMap)
    })

    it('should resolve direct connection references case-insensitively', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const connections = new Map<string, AuthConfiguration>([
        ['Primary', { clientId: 'primary-client-id' }]
      ])
      const connectionsMap = [{ serviceUrl: '*', connection: 'primary' }]

      const config = getAuthConfigWithDefaults({ connections, connectionsMap })

      assert.strictEqual(config.clientId, 'primary-client-id')
      assert.strictEqual(config.connections, connections)
      assert.strictEqual(config.connectionsMap, connectionsMap)
    })

    it('should ignore direct flat JSON when modern connections env is present', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        tenantId: 'legacy-tenant-id',
        Connections__modern__Settings__TenantId: 'modern-tenant-id',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }
      const directConfig = JSON.parse(JSON.stringify({
        tenantId: 'direct-tenant-id',
        clientId: 'direct-client-id',
        clientSecret: 'direct-client-secret'
      })) as AuthConfiguration

      const config = getAuthConfigWithDefaults(directConfig)

      assert.strictEqual(config.clientId, 'modern-client-id')
      assert.strictEqual(config.tenantId, 'modern-tenant-id')
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.connections?.has('modern'), true)
      assert.strictEqual(config.connections?.has('serviceConnection'), false)
    })

    it('should retain legacy fallback fields when modern env causes direct flat JSON to be ignored', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        tenantId: 'legacy-tenant-id',
        Connections__modern__Settings__ClientId: 'modern-client-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }

      const config = getAuthConfigWithDefaults({ clientId: 'direct-client-id' })

      assert.strictEqual(config.clientId, 'modern-client-id')
      assert.strictEqual(config.tenantId, 'legacy-tenant-id')
    })

    it('should merge legacy flat env into direct JSON while preferring direct values', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        tenantId: 'legacy-tenant-id',
        clientId: 'legacy-client-id',
        clientSecret: 'legacy-client-secret',
        certPemFile: 'legacy-cert.pem'
      }
      const directConfig = JSON.parse(JSON.stringify({
        tenantId: 'direct-tenant-id',
        clientId: 'direct-client-id'
      })) as AuthConfiguration

      const config = getAuthConfigWithDefaults(directConfig)

      assert.strictEqual(config.tenantId, 'direct-tenant-id')
      assert.strictEqual(config.clientId, 'direct-client-id')
      assert.strictEqual(config.clientSecret, 'legacy-client-secret')
      assert.strictEqual(config.certPemFile, 'legacy-cert.pem')
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'direct-client-id')
    })

    it('isolates auth settings between host-scoped contexts', async () => {
      const createContext = async (name: string, clientId: string) =>
        await createConfigurationContext([{
          source: {
            name,
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.serviceConnection.settings.clientId': clientId,
                  'connections.serviceConnection.settings.clientSecret': 'context-secret',
                  'connections.serviceConnection.settings.tenantId': 'context-tenant',
                  'connectionsMap.0.serviceUrl': '*',
                  'connectionsMap.0.connection': 'serviceConnection'
                }
              } as const
            }
          },
          mode: 'overrideEnvironment'
        }])

      const firstContext = await createContext('first-context', 'first-client')
      const secondContext = await createContext('second-context', 'second-client')

      const first = getAuthConfigWithDefaults(undefined, { configurationContext: firstContext })
      const second = getAuthConfigWithDefaults(undefined, { configurationContext: secondContext })

      assert.equal(first.clientId, 'first-client')
      assert.equal(second.clientId, 'second-client')
    })

    it('does not fall back to globally preloaded auth from a host-scoped context', async () => {
      await preloadConfigurationSources([{
        source: {
          name: 'global-auth',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.global.settings.clientId': 'global-client',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'global'
              }
            } as const
          }
        },
        mode: 'enforce'
      }])
      const configurationContext = await createConfigurationContext([{
        source: {
          name: 'scoped-adapter-options',
          async load () {
            return {
              format: 'document',
              value: {
                cloudAdapterOptions: {
                  emitStackTrace: true
                }
              }
            } as const
          }
        },
        mode: 'overrideEnvironment'
      }])

      const result = getAuthConfigWithDefaults(undefined, { configurationContext })

      assert.equal(result.clientId, 'test-client-id')
      assert.equal(result.connections?.has('global'), false)
    })

    it('should layer preloaded values between environment and direct JSON', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        clientId: 'legacy-client-id',
        tenantId: 'legacy-tenant-id'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'central-auth',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.serviceConnection.settings.clientId': 'central-client-id',
                'connections.serviceConnection.settings.clientSecret': 'central-secret'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }])

      const config = getAuthConfigWithDefaults({ clientId: 'direct-client-id' })

      assert.strictEqual(config.clientId, 'direct-client-id')
      assert.strictEqual(config.clientSecret, 'central-secret')
    })

    it('should allow enforce-mode preloaded values to enforce an auth setting', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'central-policy',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.serviceConnection.settings.clientId': 'policy-client-id'
              }
            }
          }
        },
        mode: 'enforce'
      }])

      const config = getAuthConfigWithDefaults({ clientId: 'direct-client-id' })

      assert.strictEqual(config.clientId, 'policy-client-id')
    })

    it('should validate modern connections env in production', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'production',
        Connections__modern__Settings__TenantId: 'modern-tenant-id',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'modern'
      }

      assert.throws(() => loadAuthConfigFromEnv(), /ClientId required in production/)
    })

    it('should keep below-legacy external values below legacy env fallbacks', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        tenantId: 'legacy-tenant-id',
        clientId: 'legacy-client-id',
        clientSecret: 'legacy-client-secret'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'fallback-auth',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.serviceConnection.settings.clientId': 'external-client-id',
                'connections.serviceConnection.settings.clientSecret': 'external-client-secret',
                'connections.serviceConnection.settings.authorityEndpoint': 'https://login.microsoftonline.us'
              }
            }
          }
        },
        mode: 'fallback'
      }])

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.tenantId, 'legacy-tenant-id')
      assert.strictEqual(config.clientId, 'legacy-client-id')
      assert.strictEqual(config.clientSecret, 'legacy-client-secret')
      assert.strictEqual(config.authorityEndpoint, 'https://login.microsoftonline.us')
      assert.strictEqual(config.connections?.get('serviceConnection')?.tenantId, 'legacy-tenant-id')
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'legacy-client-id')
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientSecret, 'legacy-client-secret')
      assert.strictEqual(config.connections?.get('serviceConnection')?.authorityEndpoint, 'https://login.microsoftonline.us')
    })

    it('should apply flat auth values to both the top-level config and the selected connection', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'named-connection',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientSecret': 'primary-secret',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'primary'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }])

      const config = getAuthConfigWithDefaults({
        tenantId: 'direct-tenant-id',
        clientId: 'direct-client-id'
      })

      assert.strictEqual(config.tenantId, 'direct-tenant-id')
      assert.strictEqual(config.clientId, 'direct-client-id')
      assert.strictEqual(config.clientSecret, 'primary-secret')
      assert.strictEqual(config.connections?.get('primary')?.tenantId, 'direct-tenant-id')
      assert.strictEqual(config.connections?.get('primary')?.clientId, 'direct-client-id')
      assert.strictEqual(config.connections?.get('primary')?.clientSecret, 'primary-secret')
    })

    it('should select a preloaded named connection even when no env connections exist', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'preloaded-only-connections',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientId': 'primary-client-id',
                'connections.secondary.settings.clientId': 'secondary-client-id',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'secondary'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }])

      const config = loadAuthConfigFromEnv('primary')

      assert.strictEqual(config.clientId, 'primary-client-id')
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'primary' }])
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])], ['primary', 'secondary'])
    })

    it('should fail with an AgentError when a preloaded named connection is missing', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'preloaded-only-connections',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientId': 'primary-client-id',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'primary'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }])

      assert.throws(
        () => loadAuthConfigFromEnv('missing'),
        (error: Error & { code?: number }) => {
          assert.strictEqual(error.code, Errors.ConnectionNotFoundInEnvironment.code)
          assert.match(error.message, /missing/)
          return true
        }
      )
    })

    it('should preserve lower connectionsMap properties when a higher layer overlays only one property', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([
        {
          source: {
            name: 'base-routes',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.primary.settings.clientId': 'primary-client-id',
                  'connectionsMap.0.serviceUrl': '*',
                  'connectionsMap.0.connection': 'primary'
                }
              }
            }
          },
          mode: 'fallback'
        },
        {
          source: {
            name: 'route-overlay',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connectionsMap.0.audience': 'aud-1'
                }
              }
            }
          },
          mode: 'enforce'
        }
      ])

      const config = loadAuthConfigFromEnv()

      assert.deepStrictEqual(config.connectionsMap, [{
        serviceUrl: '*',
        connection: 'primary',
        audience: 'aud-1'
      }])
    })

    it('should not let a non-default connection overlay hijack the wildcard default route', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([
        {
          source: {
            name: 'base-default',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.primary.settings.clientId': 'primary-client-id',
                  'connections.secondary.settings.clientId': 'secondary-client-id',
                  'connectionsMap.0.serviceUrl': '*',
                  'connectionsMap.0.connection': 'primary'
                }
              }
            }
          },
          mode: 'fallback'
        },
        {
          source: {
            name: 'secondary-overlay',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.secondary.settings.clientSecret': 'secondary-secret'
                }
              }
            }
          },
          mode: 'overrideEnvironment'
        }
      ])

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.clientId, 'primary-client-id')
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'primary' }])
      assert.strictEqual(config.connections?.get('secondary')?.clientSecret, 'secondary-secret')
    })

    it('should resolve sparse high-index route patches when lower layers make the final route complete', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([
        {
          source: {
            name: 'base-routes',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.primary.settings.clientId': 'primary-client-id',
                  'connections.secondary.settings.clientId': 'secondary-client-id',
                  'connectionsMap.0.serviceUrl': '*',
                  'connectionsMap.0.connection': 'primary',
                  'connectionsMap.7.serviceUrl': 'https://secondary.example',
                  'connectionsMap.7.connection': 'secondary'
                }
              }
            }
          },
          mode: 'fallback'
        },
        {
          source: {
            name: 'route-overlay',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connectionsMap.7.audience': 'aud-7'
                }
              }
            }
          },
          mode: 'enforce'
        }
      ])

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.clientId, 'primary-client-id')
      assert.deepStrictEqual(config.connectionsMap, [
        { serviceUrl: '*', connection: 'primary' },
        {
          serviceUrl: 'https://secondary.example',
          connection: 'secondary',
          audience: 'aud-7'
        }
      ])
    })

    it('should fail sparse high-index route patches with an AgentError instead of a raw TypeError', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'incomplete-route',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientId': 'primary-client-id',
                'connectionsMap.7.audience': 'aud-7'
              }
            }
          }
        },
        mode: 'overrideEnvironment'
      }])

      assert.throws(
        () => loadAuthConfigFromEnv(),
        (error: Error & { code?: number }) => {
          assert.notStrictEqual(error.name, 'TypeError')
          assert.strictEqual(error.code, Errors.InvalidConnectionMapEntry.code)
          assert.match(error.message, /index 7/)
          return true
        }
      )
    })
  })

  describe('getAuthConfigWithDefaults', () => {
    it('should preserve flat direct JSON routes through the synthesized compatibility connection', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const connectionsMap = [
        { serviceUrl: 'https://target.example', connection: 'serviceConnection' },
        { serviceUrl: '*', connection: 'serviceConnection' }
      ]

      const config = getAuthConfigWithDefaults({
        tenantId: 'direct-tenant',
        clientId: 'direct-client',
        connectionsMap
      })

      assert.strictEqual(config.clientId, 'direct-client')
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'direct-client')
      assert.strictEqual(config.connectionsMap, connectionsMap)
    })

    it('should preserve flat direct routes when an external source contributes a partial route', async () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const configurationContext = await createConfigurationContext([{
        source: {
          name: 'route-audience',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connectionsMap.0.audience': 'route-audience'
              }
            } as const
          }
        },
        mode: 'fallback'
      }])

      const config = getAuthConfigWithDefaults({
        tenantId: 'direct-tenant',
        clientId: 'direct-client',
        connectionsMap: [{ serviceUrl: '*', connection: 'serviceConnection' }]
      }, { configurationContext })

      assert.strictEqual(config.clientId, 'direct-client')
      assert.strictEqual(config.connections?.get('serviceConnection')?.clientId, 'direct-client')
      assert.deepStrictEqual(config.connectionsMap, [{
        serviceUrl: '*',
        connection: 'serviceConnection',
        audience: 'route-audience'
      }])
    })

    it('should resolve external connection references and overlays case-insensitively', async () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const configurationContext = await createConfigurationContext([
        {
          source: {
            name: 'base-connection',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.Primary.settings.clientId': 'primary-client',
                  'connectionsMap.0.serviceUrl': '*',
                  'connectionsMap.0.connection': 'primary'
                }
              } as const
            }
          },
          mode: 'fallback'
        },
        {
          source: {
            name: 'connection-overlay',
            async load () {
              return {
                format: 'canonical',
                values: {
                  'connections.primary.settings.clientSecret': 'primary-secret'
                }
              } as const
            }
          },
          mode: 'enforce'
        }
      ])

      const config = getAuthConfigWithDefaults(undefined, { configurationContext })

      assert.strictEqual(config.clientId, 'primary-client')
      assert.strictEqual(config.clientSecret, 'primary-secret')
      assert.deepStrictEqual([...(config.connections?.keys() ?? [])], ['Primary'])
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'primary' }])
    })

    it('should retain environment routes when a direct registry omits its map', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        ConnectionsMap__0__ServiceUrl: '*',
        ConnectionsMap__0__Connection: 'secondary'
      }
      const connections = new Map<string, AuthConfiguration>([
        ['primary', { clientId: 'primary-client' }],
        ['secondary', { clientId: 'secondary-client' }]
      ])

      const config = getAuthConfigWithDefaults({ connections })

      assert.strictEqual(config.clientId, 'secondary-client')
      assert.strictEqual(config.connections, connections)
      assert.deepStrictEqual(config.connectionsMap, [{ serviceUrl: '*', connection: 'secondary' }])
    })

    it('should merge direct registry routes with lower external route properties', async () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      await preloadConfigurationSources([{
        source: {
          name: 'base-route',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientId': 'base-client',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'primary',
                'connectionsMap.0.audience': 'base-audience'
              }
            } as const
          }
        },
        mode: 'fallback'
      }])
      const connections = new Map<string, AuthConfiguration>([
        ['primary', { clientId: 'direct-client' }]
      ])

      const config = getAuthConfigWithDefaults({
        connections,
        connectionsMap: [{ serviceUrl: '*', connection: 'primary' }]
      })

      assert.equal(config.clientId, 'direct-client')
      assert.deepEqual(config.connectionsMap, [{
        serviceUrl: '*',
        connection: 'primary',
        audience: 'base-audience'
      }])
    })

    it('should preserve the origin missing-default error for a direct registry without any routes', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const connections = new Map<string, AuthConfiguration>([
        ['primary', { clientId: 'primary-client' }],
        ['secondary', { clientId: 'secondary-client' }]
      ])

      assert.throws(
        () => getAuthConfigWithDefaults({ connections }),
        (error: Error & { code?: number }) => {
          assert.strictEqual(error.constructor, Error)
          assert.strictEqual(error.code, Errors.NoDefaultConnectionFound.code)
          assert.match(error.message, /default connection/i)
          return true
        }
      )
    })

    it('should preserve caller registry, route, and connection references without sources', () => {
      process.env = { TEST_MODE: 'true', NODE_ENV: 'development' }
      const primary: AuthConfiguration = { clientId: 'primary-client' }
      const connections = new Map<string, AuthConfiguration>([['primary', primary]])
      const connectionsMap = [{ serviceUrl: '*', connection: 'primary' }]

      const config = getAuthConfigWithDefaults({ connections, connectionsMap })

      assert.strictEqual(config.connections, connections)
      assert.strictEqual(config.connections?.get('primary'), primary)
      assert.strictEqual(config.connectionsMap, connectionsMap)
    })

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

    it('should use the authority-embedded tenant for all default issuers', () => {
      const config = getAuthConfigWithDefaults({
        clientId: 'custom-test-client',
        tenantId: 'stale-tenant',
        authorityEndpoint: 'https://login.microsoftonline.com/embedded-tenant'
      })

      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/embedded-tenant/',
        'https://login.microsoftonline.com/embedded-tenant/v2.0'
      ])
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

    it('should use US Government default issuers when the authority is a gov endpoint', () => {
      delete process.env.idpmResource

      const config: AuthConfiguration = getAuthConfigWithDefaults({
        clientId: 'gov-client',
        tenantId: 'gov-tenant-id',
        authorityEndpoint: 'https://login.microsoftonline.us'
      })
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.us',
        'https://sts.windows.net/gov-tenant-id/',
        'https://login.microsoftonline.us/gov-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.us')
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

  describe('msalRetryCount', () => {
    it('should load msalRetryCount from connections env var', () => {
      process.env['connections__serviceConnection__settings__clientId'] = 'test-client-id'
      process.env['connections__serviceConnection__settings__msalRetryCount'] = '5'
      process.env['connectionsMap__0__serviceUrl'] = '*'
      process.env['connectionsMap__0__connection'] = 'serviceConnection'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.msalRetryCount, 5)
    })

    it('should load msalRetryCount from legacy env var', () => {
      process.env.msalRetryCount = '4'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.msalRetryCount, 4)
    })

    it('should allow zero retries from env', () => {
      process.env.msalRetryCount = '0'

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.msalRetryCount, 0)
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

    it('should merge partial env routes with lower external route properties without synthesizing serviceConnection', async () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        Connections__primary__Settings__ClientId: 'env-client-id',
        ConnectionsMap__0__Audience: 'env-audience'
      }
      await preloadConfigurationSources([{
        source: {
          name: 'base-route',
          async load () {
            return {
              format: 'canonical',
              values: {
                'connections.primary.settings.clientSecret': 'base-secret',
                'connectionsMap.0.serviceUrl': '*',
                'connectionsMap.0.connection': 'primary'
              }
            }
          }
        },
        mode: 'fallback'
      }])

      const config = loadAuthConfigFromEnv()

      assert.strictEqual(config.clientId, 'env-client-id')
      assert.strictEqual(config.connections?.has('serviceConnection'), false)
      assert.deepStrictEqual(config.connectionsMap, [{
        serviceUrl: '*',
        connection: 'primary',
        audience: 'env-audience'
      }])
    })

    it('should fail sparse incomplete env routes with an AgentError instead of a raw TypeError', () => {
      process.env = {
        TEST_MODE: 'true',
        NODE_ENV: 'development',
        Connections__primary__Settings__ClientId: 'env-client-id',
        ConnectionsMap__7__Audience: 'env-audience'
      }

      assert.throws(
        () => loadAuthConfigFromEnv(),
        (error: Error & { code?: number }) => {
          assert.notStrictEqual(error.name, 'TypeError')
          assert.strictEqual(error.code, Errors.InvalidConnectionMapEntry.code)
          assert.match(error.message, /index 7/)
          return true
        }
      )
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
