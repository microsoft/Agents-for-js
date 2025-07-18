import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { AuthConfiguration, loadAuthConfigFromEnv, loadPrevAuthConfigFromEnv } from '../../src'

describe('AuthConfiguration', () => {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    // Store original environment variables
    originalEnv = { ...process.env }

    // Reset environment variables before each test
    process.env.tenantId = 'test-tenant-id'
    process.env.clientId = 'test-client-id'
    process.env.clientSecret = 'test-client-secret'
    process.env.certPemFile = 'test-cert.pem'
    process.env.certKeyFile = 'test-cert.key'
    process.env.connectionName = 'test-connection'
    process.env.FICClientId = 'test-fic-client-id'
    process.env.authorityEndpoint = 'https://login.microsoftonline.com'
    process.env.NODE_ENV = 'development'
  })

  afterEach(() => {
    // Restore original environment variables
    process.env = originalEnv
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
      assert.strictEqual(config.FICClientId, 'test-fic-client-id')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/test-tenant-id/',
        'https://login.microsoftonline.com/test-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.com')
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

      const config = loadAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, undefined)
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.certPemFile, undefined)
      assert.strictEqual(config.certKeyFile, undefined)
      assert.strictEqual(config.connectionName, undefined)
      assert.strictEqual(config.FICClientId, undefined)
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/undefined/',
        'https://login.microsoftonline.com/undefined/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.com')
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
    })

    it('should load configuration from connection-specific environment variables', () => {
      const config = loadAuthConfigFromEnv('myconn')
      assert.strictEqual(config.tenantId, 'conn-tenant-id')
      assert.strictEqual(config.clientId, 'conn-client-id')
      assert.strictEqual(config.clientSecret, 'conn-client-secret')
      assert.strictEqual(config.certPemFile, 'conn-cert.pem')
      assert.strictEqual(config.certKeyFile, 'conn-cert.key')
      assert.strictEqual(config.connectionName, 'conn-connection-name')
      assert.strictEqual(config.FICClientId, undefined) // Falls back to global FICClientId
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/conn-tenant-id/',
        'https://login.microsoftonline.com/conn-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.com')
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
      assert.strictEqual(config.FICClientId, undefined)
      assert.deepStrictEqual(config.authority, 'https://login.microsoftonline.com')
    })
  })

  describe('loadPrevAuthConfigFromEnv', () => {
    beforeEach(() => {
      // Set up Microsoft App environment variables
      process.env.MicrosoftAppId = 'microsoft-app-id'
      process.env.MicrosoftAppPassword = 'microsoft-app-password'
      process.env.MicrosoftAppTenantId = 'microsoft-tenant-id'
      process.env.MicrosoftAppClientId = 'microsoft-app-client-id'
    })

    it('should load configuration from Microsoft App environment variables', () => {
      const config = loadPrevAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, 'microsoft-tenant-id')
      assert.strictEqual(config.clientId, 'microsoft-app-id')
      assert.strictEqual(config.clientSecret, 'microsoft-app-password')
      assert.strictEqual(config.FICClientId, 'microsoft-app-client-id')
      assert.strictEqual(config.certPemFile, 'test-cert.pem')
      assert.strictEqual(config.certKeyFile, 'test-cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/microsoft-tenant-id/',
        'https://login.microsoftonline.com/microsoft-tenant-id/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.com')
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

      const config = loadPrevAuthConfigFromEnv()
      assert.strictEqual(config.tenantId, undefined)
      assert.strictEqual(config.clientSecret, undefined)
      assert.strictEqual(config.FICClientId, undefined)
      assert.strictEqual(config.certPemFile, undefined)
      assert.strictEqual(config.certKeyFile, undefined)
      assert.strictEqual(config.connectionName, undefined)
      assert.deepStrictEqual(config.issuers, [
        'https://api.botframework.com',
        'https://sts.windows.net/undefined/',
        'https://login.microsoftonline.com/undefined/v2.0'
      ])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.com')
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
        FICClientId: 'fic-client',
        issuers: ['https://example.com'],
        authority: 'https://login.microsoftonline.us'
      }

      assert.strictEqual(config.tenantId, 'test-tenant')
      assert.strictEqual(config.clientId, 'test-client')
      assert.strictEqual(config.clientSecret, 'test-secret')
      assert.strictEqual(config.certPemFile, 'cert.pem')
      assert.strictEqual(config.certKeyFile, 'cert.key')
      assert.strictEqual(config.connectionName, 'test-connection')
      assert.strictEqual(config.FICClientId, 'fic-client')
      assert.deepStrictEqual(config.issuers, ['https://example.com'])
      assert.strictEqual(config.authority, 'https://login.microsoftonline.us')
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
