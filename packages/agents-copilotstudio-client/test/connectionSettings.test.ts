import { strict as assert } from 'assert'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { ConnectionSettings, loadCopilotStudioConnectionSettingsFromEnv } from '../src/connectionSettings'
import { PowerPlatformCloud } from '../src/powerPlatformCloud'
import { AgentType } from '../src/agentType'

describe('ConnectionSettings', function () {
  let originalEnv: NodeJS.ProcessEnv

  beforeEach(() => {
    originalEnv = { ...process.env }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('constructor', function () {
    it('should create empty instance with default constructor', function () {
      const settings = new ConnectionSettings()
      assert(settings instanceof ConnectionSettings)
      assert.strictEqual(settings.appClientId, '')
      assert.strictEqual(settings.tenantId, '')
      assert.strictEqual(settings.environmentId, '')
      assert.strictEqual(settings.agentIdentifier, '')
    })

    it('should create instance with valid options', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        cloud: PowerPlatformCloud.Prod,
        copilotAgentType: AgentType.Published
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.appClientId, options.appClientId)
      assert.strictEqual(settings.tenantId, options.tenantId)
      assert.strictEqual(settings.environmentId, options.environmentId)
      assert.strictEqual(settings.agentIdentifier, options.agentIdentifier)
      assert.strictEqual(settings.cloud, options.cloud)
      assert.strictEqual(settings.copilotAgentType, options.copilotAgentType)
    })

    it('should use default values when not provided', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot'
        // cloud and copilotAgentType not provided
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.cloud, PowerPlatformCloud.Prod)
      assert.strictEqual(settings.copilotAgentType, AgentType.Published)
    })

    it('should set default authority when not provided', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot'
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.authority, 'https://login.microsoftonline.com')
    })

    it('should use provided authority when given', function () {
      const customAuthority = 'https://custom.authority.com'
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        authority: customAuthority
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.authority, customAuthority)
    })

    it('should ignore empty authority and use default', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        authority: ''
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.authority, 'https://login.microsoftonline.com')
    })

    it('should ignore whitespace-only authority and use default', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        authority: '   '
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.authority, 'https://login.microsoftonline.com')
    })

    it('should handle all PowerPlatformCloud values', function () {
      const cloudValues = Object.values(PowerPlatformCloud)

      cloudValues.forEach(cloud => {
        const options = {
          appClientId: 'test-client-id',
          tenantId: 'test-tenant-id',
          environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
          agentIdentifier: 'TestBot',
          cloud
        }

        const settings = new ConnectionSettings(options)
        assert.strictEqual(settings.cloud, cloud)
      })
    })

    it('should handle all AgentType values', function () {
      const agentTypes = Object.values(AgentType)

      agentTypes.forEach(agentType => {
        const options = {
          appClientId: 'test-client-id',
          tenantId: 'test-tenant-id',
          environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
          agentIdentifier: 'TestBot',
          copilotAgentType: agentType
        }

        const settings = new ConnectionSettings(options)
        assert.strictEqual(settings.copilotAgentType, agentType)
      })
    })

    it('should throw error for invalid PowerPlatformCloud', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        cloud: 'InvalidCloud' as any
      }

      assert.throws(() => {
        // eslint-disable-next-line no-new
        new ConnectionSettings(options)
      }, /Invalid PowerPlatformCloud/)
    })

    it('should throw error for invalid AgentType', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        copilotAgentType: 'InvalidAgentType' as any
      }

      assert.throws(() => {
        // eslint-disable-next-line no-new
        new ConnectionSettings(options)
      }, /Invalid AgentType/)
    })

    it('should handle optional fields', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        customPowerPlatformCloud: 'custom.cloud.com',
        directConnectUrl: 'https://direct.connect.url',
        useExperimentalEndpoint: true
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.customPowerPlatformCloud, options.customPowerPlatformCloud)
      assert.strictEqual(settings.directConnectUrl, options.directConnectUrl)
      assert.strictEqual(settings.useExperimentalEndpoint, options.useExperimentalEndpoint)
    })

    it('should handle useExperimentalEndpoint false', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        useExperimentalEndpoint: false
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.useExperimentalEndpoint, false)
    })

    it('should handle useExperimentalEndpoint undefined', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot'
        // useExperimentalEndpoint not set
      }

      const settings = new ConnectionSettings(options)
      assert.strictEqual(settings.useExperimentalEndpoint, false)
    })
  })

  describe('loadCopilotStudioConnectionSettingsFromEnv', function () {
    it('should load settings from environment variables', function () {
      process.env.appClientId = 'env-client-id'
      process.env.tenantId = 'env-tenant-id'
      process.env.environmentId = 'ENV-47151CF-4F34-488F-B377-EBE84E17B478'
      process.env.agentIdentifier = 'EnvBot'
      process.env.cloud = PowerPlatformCloud.Preprod
      process.env.copilotAgentType = AgentType.Prebuilt

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.appClientId, 'env-client-id')
      assert.strictEqual(settings.tenantId, 'env-tenant-id')
      assert.strictEqual(settings.environmentId, 'ENV-47151CF-4F34-488F-B377-EBE84E17B478')
      assert.strictEqual(settings.agentIdentifier, 'EnvBot')
      assert.strictEqual(settings.cloud, PowerPlatformCloud.Preprod)
      assert.strictEqual(settings.copilotAgentType, AgentType.Prebuilt)
    })

    it('should use empty strings for missing required env vars', function () {
      // Clear environment variables
      delete process.env.appClientId
      delete process.env.tenantId
      delete process.env.environmentId
      delete process.env.agentIdentifier

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.appClientId, '')
      assert.strictEqual(settings.tenantId, '')
      assert.strictEqual(settings.environmentId, '')
      assert.strictEqual(settings.agentIdentifier, '')
    })

    it('should use default authority when authorityEndpoint not set', function () {
      delete process.env.authorityEndpoint

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.authority, 'https://login.microsoftonline.com')
    })

    it('should use custom authority when authorityEndpoint is set', function () {
      process.env.authorityEndpoint = 'https://custom.authority.endpoint'

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.authority, 'https://custom.authority.endpoint')
    })

    it('should handle optional environment variables', function () {
      process.env.customPowerPlatformCloud = 'env.custom.cloud'
      process.env.directConnectUrl = 'https://env.direct.connect'
      process.env.useExperimentalEndpoint = 'true'

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.customPowerPlatformCloud, 'env.custom.cloud')
      assert.strictEqual(settings.directConnectUrl, 'https://env.direct.connect')
      assert.strictEqual(settings.useExperimentalEndpoint, true)
    })

    it('should handle useExperimentalEndpoint with various string values', function () {
      // Test 'true'
      process.env.useExperimentalEndpoint = 'true'
      let settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.useExperimentalEndpoint, true)

      // Test 'TRUE'
      process.env.useExperimentalEndpoint = 'TRUE'
      settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.useExperimentalEndpoint, true) // Should be true due to toLowerCase()

      // Test 'false'
      process.env.useExperimentalEndpoint = 'false'
      settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.useExperimentalEndpoint, false)

      // Test undefined
      delete process.env.useExperimentalEndpoint
      settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.useExperimentalEndpoint, false)
    })

    it('should handle empty optional environment variables', function () {
      process.env.customPowerPlatformCloud = ''
      process.env.directConnectUrl = ''
      process.env.useExperimentalEndpoint = ''

      const settings = loadCopilotStudioConnectionSettingsFromEnv()
      assert.strictEqual(settings.customPowerPlatformCloud, '')
      assert.strictEqual(settings.directConnectUrl, '')
      assert.strictEqual(settings.useExperimentalEndpoint, false)
    })

    it('should handle all combinations of cloud and agent type from env', function () {
      const clouds = Object.values(PowerPlatformCloud)
      const agentTypes = Object.values(AgentType)

      clouds.forEach(cloud => {
        agentTypes.forEach(agentType => {
          process.env.appClientId = 'test-client'
          process.env.tenantId = 'test-tenant'
          process.env.environmentId = 'test-env'
          process.env.agentIdentifier = 'test-agent'
          process.env.cloud = cloud
          process.env.copilotAgentType = agentType

          const settings = loadCopilotStudioConnectionSettingsFromEnv()
          assert.strictEqual(settings.cloud, cloud)
          assert.strictEqual(settings.copilotAgentType, agentType)
        })
      })
    })
  })

  describe('ConnectionOptions abstract class behavior', function () {
    it('should inherit all properties from ConnectionOptions', function () {
      const options = {
        appClientId: 'test-client-id',
        tenantId: 'test-tenant-id',
        authority: 'https://custom.authority.com',
        environmentId: 'A47151CF-4F34-488F-B377-EBE84E17B478',
        agentIdentifier: 'TestBot',
        cloud: PowerPlatformCloud.Preprod,
        customPowerPlatformCloud: 'custom.cloud.com',
        copilotAgentType: AgentType.Prebuilt,
        directConnectUrl: 'https://direct.url',
        useExperimentalEndpoint: true
      }

      const settings = new ConnectionSettings(options)

      // Verify all properties are set
      assert.strictEqual(settings.appClientId, options.appClientId)
      assert.strictEqual(settings.tenantId, options.tenantId)
      assert.strictEqual(settings.authority, options.authority)
      assert.strictEqual(settings.environmentId, options.environmentId)
      assert.strictEqual(settings.agentIdentifier, options.agentIdentifier)
      assert.strictEqual(settings.cloud, options.cloud)
      assert.strictEqual(settings.customPowerPlatformCloud, options.customPowerPlatformCloud)
      assert.strictEqual(settings.copilotAgentType, options.copilotAgentType)
      assert.strictEqual(settings.directConnectUrl, options.directConnectUrl)
      assert.strictEqual(settings.useExperimentalEndpoint, options.useExperimentalEndpoint)
    })

    it('should maintain default values for ConnectionOptions', function () {
      const settings = new ConnectionSettings()

      assert.strictEqual(settings.appClientId, '')
      assert.strictEqual(settings.tenantId, '')
      assert.strictEqual(settings.authority, '')
      assert.strictEqual(settings.environmentId, '')
      assert.strictEqual(settings.agentIdentifier, '')
      assert.strictEqual(settings.useExperimentalEndpoint, false)
    })
  })
})
